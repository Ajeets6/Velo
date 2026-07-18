import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { validateChatRequest, validateVisualizationJob, requireValid } from "./contracts.mjs";
import { VeloError, errorPayload, toVeloError } from "./errors.mjs";
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
  const value = { contractVersion: 1, id: job.id, status: job.status, stage: job.stage, error: job.error, videoUrl: job.status === "complete" ? `/renders/${job.id}/animation.mp4` : null, createdAt: job.createdAt };
  return requireValid(validateVisualizationJob(value), "The animation job did not match the Velo contract.");
}

async function serveVideo(request, response, filePath) {
  const details = await stat(filePath);
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, { "content-type": "video/mp4", "content-length": details.size, "accept-ranges": "bytes", "cache-control": "no-store" });
    return createReadStream(filePath).pipe(response);
  }
  const [startText, endText] = range.replace("bytes=", "").split("-");
  const start = Number(startText);
  const end = endText ? Number(endText) : details.size - 1;
  if (!Number.isFinite(start) || start < 0 || end >= details.size || start > end) {
    response.writeHead(416, { "content-range": `bytes */${details.size}` });
    return response.end();
  }
  response.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${details.size}`, "accept-ranges": "bytes", "cache-control": "no-store" });
  return createReadStream(filePath, { start, end }).pipe(response);
}

export function createVeloServer({ config = loadConfig(), provider = createProvider(config), log = createLogger() } = {}) {
  const animationJobs = new Map();
  const providerHealth = { checkedAt: null, result: null };

  async function refreshProviderHealth() {
    try { providerHealth.result = await provider.health(); }
    catch (error) { providerHealth.result = { ok: false, code: toVeloError(error).code }; }
    providerHealth.checkedAt = new Date().toISOString();
    return providerHealth.result;
  }

  async function startAnimation(prompt) {
    if (!existsSync(config.motionForgeExecutable)) throw new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge is not installed or configured.", { status: 503 });
    const id = randomUUID();
    const jobDirectory = path.join(config.rendersRoot, id);
    const outputBase = path.join(jobDirectory, "animation");
    const outputFile = `${outputBase}.mp4`;
    await mkdir(jobDirectory, { recursive: true });
    const job = { id, status: "queued", stage: "Starting MotionForge…", error: null, outputFile, createdAt: new Date().toISOString(), logs: [] };
    animationJobs.set(id, job);
    const animationPrompt = `Create a clear, short educational physics animation for this request: ${prompt}. Use a white background, readable labels, physically plausible values, a duration of 2 to 3 seconds, and simple primitive shapes.`;
    const child = spawn(config.motionForgeExecutable, [animationPrompt, "--provider", "ollama", "--model", config.motionForgeModel, "--quality", "low", "--output", outputBase], { cwd: jobDirectory, windowsHide: true, env: process.env });
    job.status = "running";
    const handleOutput = (chunk) => {
      const text = chunk.toString();
      job.logs.push(text); if (job.logs.length > 60) job.logs.shift();
      if (text.includes("[1/4]")) job.stage = "Designing the scene…";
      if (text.includes("[2/4]")) job.stage = "Simulating the physics…";
      if (text.includes("[3/4]")) job.stage = "Building the timeline…";
      if (text.includes("[4/4]")) job.stage = "Rendering the animation…";
    };
    child.stdout.on("data", handleOutput); child.stderr.on("data", handleOutput);
    child.on("error", () => { job.status = "failed"; job.stage = "Animation failed"; job.error = "MotionForge could not start."; });
    child.on("exit", (code) => {
      if (code === 0 && existsSync(outputFile)) { job.status = "complete"; job.stage = "Animation ready"; return; }
      job.status = "failed"; job.stage = "Animation failed"; job.error = "MotionForge could not complete the animation.";
    });
    return job;
  }

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    try {
      if (request.method === "OPTIONS") return send(response, 204, {}, requestId);
      if (request.method === "GET" && request.url === "/api/health") {
        const health = await refreshProviderHealth();
        return send(response, 200, { contractVersion: 1, ok: true, service: "velo-api", provider: provider.name, providerHealth: health, checkedAt: providerHealth.checkedAt }, requestId);
      }
      if (request.method === "POST" && request.url === "/api/chat") {
        const { prompt, mode } = requireValid(validateChatRequest(await readJson(request)), "Please enter a physics question between 1 and 2,000 characters.");
        let modelResult;
        try { modelResult = await provider.generateText({ prompt, mode, requestId }); }
        catch (error) {
          if (provider.name !== "ollama") throw error;
          log("warn", "provider_fallback", { requestId, code: toVeloError(error).code });
          modelResult = await createProvider({ provider: "local" }).generateText({ prompt, mode });
        }
        return send(response, 200, { contractVersion: 1, ...modelResult, mode, provider: provider.name, receivedAt: new Date().toISOString() }, requestId);
      }
      if (request.method === "POST" && request.url === "/api/animations") {
        const { prompt } = requireValid(validateChatRequest(await readJson(request)), "Please enter an animation prompt between 1 and 2,000 characters.");
        return send(response, 202, publicJob(await startAnimation(prompt)), requestId);
      }
      const jobMatch = request.url?.match(/^\/api\/animations\/([0-9a-f-]+)$/i);
      if (request.method === "GET" && jobMatch) {
        const job = animationJobs.get(jobMatch[1]);
        if (!job) throw new VeloError("NOT_FOUND", "Animation job not found.");
        return send(response, 200, publicJob(job), requestId);
      }
      const videoMatch = request.url?.match(/^\/renders\/([0-9a-f-]+)\/animation\.mp4$/i);
      if (request.method === "GET" && videoMatch) {
        const job = animationJobs.get(videoMatch[1]);
        if (!job || job.status !== "complete" || !existsSync(job.outputFile)) throw new VeloError("NOT_FOUND", "Animation not found.");
        return await serveVideo(request, response, job.outputFile);
      }
      throw new VeloError("NOT_FOUND", "The requested resource was not found.");
    } catch (error) {
      const safe = toVeloError(error);
      log("warn", "request_failed", { requestId, method: request.method, pathname: request.url, code: safe.code, durationMs: Date.now() - startedAt });
      return send(response, safe.status, errorPayload(safe, requestId), requestId);
    } finally {
      log("info", "request_complete", { requestId, method: request.method, pathname: request.url, durationMs: Date.now() - startedAt });
    }
  });
  return { server, config, provider, refreshProviderHealth };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const application = createVeloServer();
  application.server.listen(application.config.port, "127.0.0.1", () => console.log(`Velo API ready at http://127.0.0.1:${application.config.port}`));
}
