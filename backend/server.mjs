import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { validateChatRequest, validateExplainRequest, validateGuideMessageRequest, validateGuideSessionRequest, validateVisualizationExportRequest, validateVisualizationJob, validateVisualizationParametersRequest, validateVisualizationRequest, requireValid } from "./contracts.mjs";
import { ExplainService } from "./explain-service.mjs";
import { GuideService } from "./guide-service.mjs";
import { MotionForgeSidecar } from "./motionforge-sidecar.mjs";
import { TimelineCache } from "./timeline-cache.mjs";
import { VeloError, errorPayload, toVeloError } from "./errors.mjs";
import { AnimationJobManager } from "./job-manager.mjs";
import { createLogger } from "./logger.mjs";
import { createProvider } from "./providers.mjs";
import { credentialStore } from "./credential-store.mjs";
import { listPublicProviders } from "./provider-registry.mjs";
import { resolveMotionForgeSelection, resolveTutorSelection } from "./model-selection.mjs";
import { ModelRequestPayloadStore } from "./model-request-payloads.mjs";
import { WorkspaceStore } from "./workspace-store.mjs";

const securityHeaders = Object.freeze({ "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "cross-origin-resource-policy": "same-origin" });

async function readJson(request, maxBytes) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw new VeloError("INVALID_REQUEST", "Requests must use application/json.", { status: 415 });
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new VeloError("PAYLOAD_TOO_LARGE", "The request body is too large.");
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) throw new VeloError("PAYLOAD_TOO_LARGE", "The request body is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new VeloError("INVALID_REQUEST", "The request body must be valid JSON."); }
}

function send(response, status, body, requestId) {
  response.writeHead(status, { ...securityHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId });
  response.end(JSON.stringify(body));
}

function publicJob(job) {
  return requireValid(validateVisualizationJob({ contractVersion: 1, ...job }), "The animation job did not match the Velo contract.");
}

function pageParameters(url) {
  const limitText = url.searchParams.get("limit") || "20";
  const offsetText = url.searchParams.get("offset") || "0";
  const limit = Number(limitText); const offset = Number(offsetText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) throw new VeloError("INVALID_REQUEST", "limit must be 1–50 and offset must be a non-negative integer.");
  return { limit, offset };
}

async function serveVideo(request, response, filePath) {
  const details = await stat(filePath);
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, { ...securityHeaders, "content-type": "video/mp4", "content-length": details.size, "accept-ranges": "bytes", "cache-control": "no-store" });
    return createReadStream(filePath).pipe(response);
  }
  const [startText, endText] = range.replace("bytes=", "").split("-");
  const start = Number(startText); const end = endText ? Number(endText) : details.size - 1;
  if (!Number.isFinite(start) || start < 0 || end >= details.size || start > end) { response.writeHead(416, { ...securityHeaders, "content-range": `bytes */${details.size}` }); return response.end(); }
  response.writeHead(206, { ...securityHeaders, "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${details.size}`, "accept-ranges": "bytes", "cache-control": "no-store" });
  return createReadStream(filePath, { start, end }).pipe(response);
}

function createRequestGuard({ windowMs, maxRequests, maxConcurrent }) {
  const windows = new Map();
  let active = 0;
  return {
    assertRateLimit(client) {
      const now = Date.now();
      if (windows.size > 1000) for (const [key, times] of windows) if (!times.some((time) => time > now - windowMs)) windows.delete(key);
      const recent = (windows.get(client) || []).filter((time) => time > now - windowMs);
      if (recent.length >= maxRequests) throw new VeloError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
      recent.push(now); windows.set(client, recent);
    },
    async run(work, slots = 1) {
      if (active + slots > maxConcurrent) throw new VeloError("RATE_LIMITED", "Velo is busy. Please wait for an active request to finish.");
      active += slots;
      try { return await work(); } finally { active -= slots; }
    },
  };
}

function isCostlyRequest(method, pathname) {
  return method === "POST" && (pathname === "/api/chat" || pathname === "/api/explain/stream" || pathname === "/api/settings/test" || pathname === "/api/guide/sessions" || pathname === "/api/animations" || pathname === "/api/visualizations" || /\/api\/visualizations\/[0-9a-f-]+\/(parameters|exports)$/i.test(pathname));
}

export function createVeloServer({ config = loadConfig(), provider, providerFactory = createProvider, credentials = credentialStore, modelRequestPayloadStore, workspaceStore, log = createLogger(), jobManager, motionForge, timelineCache } = {}) {
  const payloads = modelRequestPayloadStore || new ModelRequestPayloadStore(config);
  const json = (request) => readJson(request, config.maxRequestBytes ?? 1048576);
  const guard = createRequestGuard({ windowMs: config.apiRateLimitWindowMs ?? 60000, maxRequests: config.apiRateLimitMaxRequests ?? 30, maxConcurrent: config.maxConcurrentModelRequests ?? 4 });
  const defaultProvider = provider || providerFactory(config, { payloadStore: payloads });
  async function environmentForProvider(providerId) {
    if (providerId !== "anthropic") return process.env;
    const apiKey = await credentials.get("anthropic");
    if (!apiKey) throw new VeloError("MODEL_UNAVAILABLE", "Save an API key for Anthropic before using it.", { status: 401 });
    return { ...process.env, ANTHROPIC_API_KEY: apiKey };
  }
  async function sidecarEnvironment() {
    const apiKey = await credentials.get("anthropic");
    return apiKey ? { ...process.env, ANTHROPIC_API_KEY: apiKey } : process.env;
  }
  const jobs = jobManager || new AnimationJobManager(config, { log, environmentForProvider });
  const explain = new ExplainService(config, { provider: defaultProvider, log });
  const guide = new GuideService(config, { log });
  const sidecar = motionForge || new MotionForgeSidecar({ executable: config.motionForgeExecutable, startupMs: config.motionForgeStartupMs, requestTimeoutMs: config.motionForgeRequestTimeoutMs ?? 60000, log, environment: sidecarEnvironment });
  const timelines = timelineCache || new TimelineCache(config);
  const workspaces = workspaceStore || new WorkspaceStore(config);
  async function providerFor(selection, supplied = false) {
    // Preserve an injected provider for the configured default. This keeps the
    // server testable while still creating a provider for a user-selected model.
    const defaultModel = config.provider === "local" ? "" : config.provider === "ollama" ? config.ollamaModel : config.providerModel;
    if (selection.provider === "local" || selection.provider === "ollama") {
      if (!supplied || (selection.provider === config.provider && selection.model === defaultModel)) return defaultProvider;
      return providerFactory({ ...config, provider: selection.provider, model: selection.model, ollamaModel: selection.model || config.ollamaModel }, { payloadStore: payloads });
    }
    const apiKey = await credentials.get(selection.provider);
    return providerFactory({ ...config, provider: selection.provider, model: selection.model, ollamaModel: selection.model, apiKey }, { payloadStore: payloads });
  }
  function workspaceFor(body, kind, selection) { return workspaces.ensure({ id: body.workspaceId, kind, title: body.prompt || `${kind} workspace`, provider: selection?.provider || "", model: selection?.model || "" }); }
  const server = createServer(async (request, response) => {
    const requestId = randomUUID(); const startedAt = Date.now();
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "OPTIONS") { response.writeHead(204, { ...securityHeaders, allow: "GET, POST, DELETE, OPTIONS" }); return response.end(); }
      if (config.localApiToken && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/renders/")) && request.headers["x-velo-local-token"] !== config.localApiToken) throw new VeloError("NOT_FOUND", "The requested resource was not found.");
      if (isCostlyRequest(request.method, url.pathname)) guard.assertRateLimit(request.socket.remoteAddress || "local");
      if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { contractVersion: 1, ok: true, service: "velo-api" }, requestId);
      if (request.method === "GET" && url.pathname === "/api/workspaces") return send(response, 200, { contractVersion: 1, workspaces: workspaces.list(url.searchParams.get("kind") || undefined) }, requestId);
      if (request.method === "POST" && url.pathname === "/api/workspaces") { const body = await json(request); return send(response, 201, workspaces.create(body), requestId); }
      const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([0-9a-f-]+)$/i);
      if (workspaceMatch && request.method === "GET") { const workspace = workspaces.get(workspaceMatch[1]); if (!workspace) throw new VeloError("NOT_FOUND", "Workspace not found."); return send(response, 200, workspace, requestId); }
      if (workspaceMatch && request.method === "DELETE") { workspaces.remove(workspaceMatch[1]); return send(response, 204, {}, requestId); }
      if (request.method === "GET" && url.pathname === "/api/settings/providers") return send(response, 200, { contractVersion: 1, providers: listPublicProviders() }, requestId);
      if (request.method === "GET" && url.pathname === "/api/settings/credentials") { const storage = credentials.status ? await credentials.status() : { available: true }; return send(response, 200, { contractVersion: 1, storage, openai: storage.available ? await credentials.has("openai") : false, anthropic: storage.available ? await credentials.has("anthropic") : false }, requestId); }
      if (request.method === "POST" && url.pathname === "/api/settings/credentials") { const { provider: credentialProvider, apiKey } = await json(request); await credentials.save(credentialProvider, apiKey); return send(response, 204, {}, requestId); }
      if (request.method === "POST" && url.pathname === "/api/settings/test") { const body = await json(request); return await guard.run(async () => { const selection = resolveTutorSelection(body, config); const testClient = await providerFor(selection, true); await testClient.health(); const result = await testClient.generateText({ prompt: "Reply exactly: OK", mode: "connection-test" }); if (!result.answer?.trim()) throw new VeloError("MODEL_UNAVAILABLE", "The selected model did not return a response."); return send(response, 200, { contractVersion: 1, ok: true, status: "ready", message: "The selected model responded." }, requestId); }); }
      const credentialMatch = url.pathname.match(/^\/api\/settings\/credentials\/(openai|anthropic)$/);
      if (credentialMatch && request.method === "DELETE") { await credentials.remove(credentialMatch[1]); return send(response, 204, {}, requestId); }
      if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = await json(request);
        const { prompt, mode } = requireValid(validateChatRequest(body), "Please enter a physics question between 1 and 2,000 characters.");
        const selection = resolveTutorSelection(body, config);
        const activeProvider = await providerFor(selection, body.provider !== undefined || body.model !== undefined);
        return await guard.run(async () => { let modelResult; try { modelResult = await activeProvider.generateText({ prompt, mode, requestId }); }
        catch (error) { if (activeProvider.name !== "ollama") throw error; log("warn", "provider_fallback", { requestId, code: toVeloError(error).code }); modelResult = await createProvider({ provider: "local" }).generateText({ prompt, mode }); }
        return send(response, 200, { contractVersion: 1, ...modelResult, mode, provider: selection.provider, model: selection.model, receivedAt: new Date().toISOString() }, requestId); });
      }
      if (request.method === "POST" && url.pathname === "/api/explain/stream") {
        const body = await json(request);
        const input = requireValid(validateExplainRequest(body), "Please enter a physics question between 1 and 2,000 characters.");
        const selection = resolveTutorSelection(body, config);
        const workspace = workspaceFor(body, "tutor", selection);
        const turn = workspaces.appendTurn({ threadId: workspace.id, mode: "explain", prompt: input.prompt });
        const { sessionId, response: explanation } = await guard.run(async () => explain.create(input, { provider: await providerFor(selection, body.provider !== undefined || body.model !== undefined) }), 3);
        workspaces.updateTurn(turn.id, { response: explanation, artifact: { explainSessionId: sessionId }, status: "complete" });
        response.writeHead(200, { ...securityHeaders, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive", "x-request-id": requestId });
        const emit = (event, payload) => response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        emit("meta", { contractVersion: 1, sessionId, workspaceId: workspace.id, turnId: turn.id, title: explanation.title, summary: explanation.summary, visualSuggestion: explanation.visualSuggestion, variants: explanation.variants });
        if (!explanation.variants) for (const section of explanation.sections) emit("section", section);
        emit("complete", { checkQuestion: explanation.checkQuestion, spokenText: explanation.spokenText });
        return response.end();
      }
      if (request.method === "POST" && url.pathname === "/api/guide/sessions") {
        const body = await json(request);
        const input = requireValid(validateGuideSessionRequest(body), "Please enter a physics problem to guide through.");
        const selection = resolveTutorSelection(body, config);
        const workspace = workspaceFor(body, "tutor", selection);
        const turn = workspaces.appendTurn({ threadId: workspace.id, mode: "guide", prompt: input.prompt });
        const session = await guard.run(async () => guide.create(input, { provider: await providerFor(selection, body.provider !== undefined || body.model !== undefined), selection }));
        workspaces.updateTurn(turn.id, { response: session, artifact: { guideSessionId: session.id }, status: "complete" });
        return send(response, 201, { ...session, workspaceId: workspace.id, turnId: turn.id }, requestId);
      }
      const guideMatch = url.pathname.match(/^\/api\/guide\/sessions\/([0-9a-f-]+)$/i);
      if (guideMatch && request.method === "GET") { const session = guide.get(guideMatch[1]); if (!session) throw new VeloError("NOT_FOUND", "Guide session not found."); return send(response, 200, session, requestId); }
      if (guideMatch && request.method === "DELETE") { guide.remove(guideMatch[1]); return send(response, 204, {}, requestId); }
      const guideMessageMatch = url.pathname.match(/^\/api\/guide\/sessions\/([0-9a-f-]+)\/messages$/i);
      if (guideMessageMatch && request.method === "POST") { const body = await json(request); const input = requireValid(validateGuideMessageRequest(body), "Please enter an answer or choose a guide action."); const session = guide.message(guideMessageMatch[1], input); if (body.workspaceId) { const prompt = input.action === "answer" ? input.answer : input.action; const turn = workspaces.appendTurn({ threadId: body.workspaceId, mode: "guide", prompt }); workspaces.updateTurn(turn.id, { response: session, artifact: { guideSessionId: session.id }, status: "complete" }); } return send(response, 200, session, requestId); }
      if (request.method === "POST" && url.pathname === "/api/animations") {
        const body = await json(request);
        const { prompt } = requireValid(validateChatRequest(body), "Please enter an animation prompt between 1 and 2,000 characters.");
        const selection = resolveMotionForgeSelection(body, config);
        const job = publicJob(jobs.create(prompt, selection));
        return send(response, 202, job, requestId);
      }
      if (request.method === "GET" && url.pathname === "/api/motionforge/health") return send(response, 200, await sidecar.health(), requestId);
      if (request.method === "POST" && url.pathname === "/api/visualizations") {
        const body = await json(request);
        const input = requireValid(validateVisualizationRequest(body), "Please enter an interactive physics request between 1 and 2,000 characters.");
        const selection = resolveMotionForgeSelection(body, config);
        const payload = await guard.run(async () => sidecar.request("/v1/visualizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: 1, ...input, provider: selection.provider, model: selection.model, simulationOptions: { recommendedPlaybackFps: 30, recordInspectables: true, detectEvents: true } }) }));
        return send(response, 202, payload, requestId);
      }
      const visualizationMatch = url.pathname.match(/^\/api\/visualizations\/([0-9a-f-]+)$/i);
      if (visualizationMatch && request.method === "GET") return send(response, 200, await sidecar.request(`/v1/visualizations/${visualizationMatch[1]}`, { method: "GET" }), requestId);
      if (visualizationMatch && request.method === "DELETE") return send(response, 200, await sidecar.request(`/v1/visualizations/${visualizationMatch[1]}`, { method: "DELETE" }), requestId);
      const timelineMatch = url.pathname.match(/^\/api\/visualizations\/([0-9a-f-]+)\/timeline$/i);
      if (timelineMatch && request.method === "GET") { try { const cached = timelines.get(timelineMatch[1]); if (cached) return send(response, 200, cached, requestId); const payload = await sidecar.request(`/v1/visualizations/${timelineMatch[1]}/timeline`, { method: "GET" }); try { return send(response, 200, timelines.put(timelineMatch[1], payload.timeline), requestId); } catch (cacheError) { log("warn", "timeline_cache_failed", { requestId, name: cacheError.name }); return send(response, 200, { contractVersion: 1, visualizationId: timelineMatch[1], timeline: payload.timeline, cached: false }, requestId); } } catch (error) { throw error; } }
      const eventMatch = url.pathname.match(/^\/api\/visualizations\/([0-9a-f-]+)\/events$/i);
      if (eventMatch && request.method === "GET") { if (url.searchParams.get("poll") === "1") return send(response, 200, await sidecar.request(`/v1/visualizations/${eventMatch[1]}`, { method: "GET" }), requestId); const upstream = await sidecar.stream(`/v1/visualizations/${eventMatch[1]}/events`, { lastEventId: request.headers["last-event-id"] }); response.writeHead(200, { ...securityHeaders, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive", "x-request-id": requestId }); const reader = upstream.body.getReader(); let closed = false; const stop = () => { closed = true; void reader.cancel().catch(() => {}); }; request.once("aborted", stop); response.once("close", stop); void (async () => { try { while (!closed) { const { value, done } = await reader.read(); if (done) break; if (!response.writableEnded) response.write(Buffer.from(value)); } } catch (error) { log("warn", "visualization_stream_failed", { requestId, code: toVeloError(error).code }); } finally { request.off("aborted", stop); response.off("close", stop); if (!response.writableEnded) response.end(); } })(); return; }
      const parameterMatch = url.pathname.match(/^\/api\/visualizations\/([0-9a-f-]+)\/parameters$/i);
      if (parameterMatch && request.method === "POST") { const input = requireValid(validateVisualizationParametersRequest(await json(request)), "Provide 1–32 valid simulation parameter values."); const payload = await guard.run(async () => sidecar.request(`/v1/visualizations/${parameterMatch[1]}/parameters`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: 1, ...input }) })); timelines.invalidate(parameterMatch[1]); return send(response, 202, payload, requestId); }
      const exportMatch = url.pathname.match(/^\/api\/visualizations\/([0-9a-f-]+)\/exports$/i);
      if (exportMatch && request.method === "POST") { const input = requireValid(validateVisualizationExportRequest(await json(request)), "Only the preview export preset is available."); return send(response, 202, await guard.run(async () => sidecar.request(`/v1/visualizations/${exportMatch[1]}/exports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: 1, ...input }) })), requestId); }
      if (request.method === "GET" && url.pathname === "/api/animations") return send(response, 200, { contractVersion: 1, jobs: jobs.list(pageParameters(url)) }, requestId);
      const jobMatch = url.pathname.match(/^\/api\/animations\/([0-9a-f-]+)$/i);
      if (jobMatch && request.method === "GET") { const job = jobs.get(jobMatch[1]); if (!job) throw new VeloError("NOT_FOUND", "Animation job not found."); return send(response, 200, publicJob(job), requestId); }
      const cancelMatch = url.pathname.match(/^\/api\/animations\/([0-9a-f-]+)\/cancel$/i);
      if (cancelMatch && request.method === "POST") return send(response, 200, publicJob(jobs.cancel(cancelMatch[1])), requestId);
      if (jobMatch && request.method === "DELETE") { jobs.remove(jobMatch[1]); return send(response, 204, {}, requestId); }
      const videoMatch = url.pathname.match(/^\/renders\/([0-9a-f-]+)\/animation\.mp4$/i);
      if (videoMatch && request.method === "GET") { const filePath = jobs.getOutputPath(videoMatch[1]); if (!filePath) throw new VeloError("NOT_FOUND", "Animation not found."); return await serveVideo(request, response, filePath); }
      throw new VeloError("NOT_FOUND", "The requested resource was not found.");
    } catch (error) {
      const safe = toVeloError(error); log("warn", "request_failed", { requestId, method: request.method, pathname: request.url, code: safe.code, durationMs: Date.now() - startedAt });
      return send(response, safe.status, errorPayload(safe, requestId), requestId);
    } finally { log("info", "request_complete", { requestId, method: request.method, pathname: request.url, durationMs: Date.now() - startedAt }); }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  return { server, config, provider: defaultProvider, jobs, explain, guide, sidecar, timelines, payloads, workspaces, close: () => { jobs.close(); explain.close(); guide.close(); timelines.close(); workspaces.close(); sidecar.stop(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.VELO_LOCAL_API_TOKEN) throw new VeloError("INVALID_REQUEST", "Start Velo with npm run dev so its local API token can be configured.");
  const application = createVeloServer();
  application.server.listen(application.config.port, "127.0.0.1", () => console.log(`Velo API ready at http://127.0.0.1:${application.config.port}`));
  process.on("SIGINT", () => { application.close(); process.exit(); });
  process.on("SIGTERM", () => { application.close(); process.exit(); });
}
