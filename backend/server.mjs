import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { validateChatRequest, validateExplainRequest, validateVisualizationJob, requireValid } from "./contracts.mjs";
import { ExplainService } from "./explain-service.mjs";
import { VeloError, errorPayload, toVeloError } from "./errors.mjs";
import { AnimationJobManager } from "./job-manager.mjs";
import { createLogger } from "./logger.mjs";
import { createProvider } from "./providers.mjs";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new VeloError("INVALID_REQUEST", "The request body must be valid JSON."); }
}

function send(response, status, body, requestId) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "x-request-id": requestId });
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
    response.writeHead(200, { "content-type": "video/mp4", "content-length": details.size, "accept-ranges": "bytes", "cache-control": "no-store" });
    return createReadStream(filePath).pipe(response);
  }
  const [startText, endText] = range.replace("bytes=", "").split("-");
  const start = Number(startText); const end = endText ? Number(endText) : details.size - 1;
  if (!Number.isFinite(start) || start < 0 || end >= details.size || start > end) { response.writeHead(416, { "content-range": `bytes */${details.size}` }); return response.end(); }
  response.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${details.size}`, "accept-ranges": "bytes", "cache-control": "no-store" });
  return createReadStream(filePath, { start, end }).pipe(response);
}

export function createVeloServer({ config = loadConfig(), provider = createProvider(config), log = createLogger(), jobManager } = {}) {
  const jobs = jobManager || new AnimationJobManager(config, { log });
  const explain = new ExplainService(config, { provider, log });
  const providerHealth = { checkedAt: null, result: null };
  async function refreshProviderHealth() {
    try { providerHealth.result = await provider.health(); }
    catch (error) { providerHealth.result = { ok: false, code: toVeloError(error).code }; }
    providerHealth.checkedAt = new Date().toISOString(); return providerHealth.result;
  }
  const server = createServer(async (request, response) => {
    const requestId = randomUUID(); const startedAt = Date.now();
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "OPTIONS") return send(response, 204, {}, requestId);
      if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { contractVersion: 1, ok: true, service: "velo-api", provider: provider.name, providerHealth: await refreshProviderHealth(), checkedAt: providerHealth.checkedAt }, requestId);
      if (request.method === "POST" && url.pathname === "/api/chat") {
        const { prompt, mode } = requireValid(validateChatRequest(await readJson(request)), "Please enter a physics question between 1 and 2,000 characters.");
        let modelResult;
        try { modelResult = await provider.generateText({ prompt, mode, requestId }); }
        catch (error) { if (provider.name !== "ollama") throw error; log("warn", "provider_fallback", { requestId, code: toVeloError(error).code }); modelResult = await createProvider({ provider: "local" }).generateText({ prompt, mode }); }
        return send(response, 200, { contractVersion: 1, ...modelResult, mode, provider: provider.name, receivedAt: new Date().toISOString() }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/api/explain/stream") {
        const input = requireValid(validateExplainRequest(await readJson(request)), "Please enter a physics question between 1 and 2,000 characters.");
        const { sessionId, response: explanation } = await explain.create(input);
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive", "x-request-id": requestId });
        const emit = (event, payload) => response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        emit("meta", { contractVersion: 1, sessionId, title: explanation.title, summary: explanation.summary, visualSuggestion: explanation.visualSuggestion });
        for (const section of explanation.sections) emit("section", section);
        emit("complete", { checkQuestion: explanation.checkQuestion, spokenText: explanation.spokenText });
        return response.end();
      }
      if (request.method === "POST" && url.pathname === "/api/animations") {
        const { prompt } = requireValid(validateChatRequest(await readJson(request)), "Please enter an animation prompt between 1 and 2,000 characters.");
        return send(response, 202, publicJob(jobs.create(prompt)), requestId);
      }
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
  return { server, config, provider, jobs, explain, refreshProviderHealth, close: () => { jobs.close(); explain.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const application = createVeloServer();
  application.server.listen(application.config.port, "127.0.0.1", () => console.log(`Velo API ready at http://127.0.0.1:${application.config.port}`));
  process.on("SIGINT", () => { application.close(); process.exit(); });
  process.on("SIGTERM", () => { application.close(); process.exit(); });
}
