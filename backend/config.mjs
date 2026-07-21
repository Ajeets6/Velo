import path from "node:path";
import os from "node:os";
import { VeloError } from "./errors.mjs";

function positiveInteger(value, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result <= 0 || result > max) throw new VeloError("INVALID_REQUEST", `${name} must be a positive integer.`);
  return result;
}

function nonNegativeInteger(value, fallback, name) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 0) throw new VeloError("INVALID_REQUEST", `${name} must be a non-negative integer.`);
  return result;
}

export function loadConfig(env = process.env, root = process.cwd()) {
  const provider = env.VELO_PROVIDER || "local";
  if (!["local", "ollama", "openai", "anthropic"].includes(provider)) throw new VeloError("INVALID_REQUEST", "VELO_PROVIDER must be local, ollama, openai, or anthropic.");
  const motionForgeProvider = env.MOTIONFORGE_PROVIDER || "ollama";
  if (!["ollama", "anthropic"].includes(motionForgeProvider)) throw new VeloError("INVALID_REQUEST", "MOTIONFORGE_PROVIDER must be ollama or anthropic.");
  const dataDir = env.VELO_DATA_DIR || path.join(env.LOCALAPPDATA || env.APPDATA || path.join(os.homedir(), ".local", "share"), "Velo");
  return Object.freeze({
    port: positiveInteger(env.VELO_API_PORT, 8787, "VELO_API_PORT", 65535),
    localApiToken: env.VELO_LOCAL_API_TOKEN || "",
    maxRequestBytes: positiveInteger(env.VELO_MAX_REQUEST_BYTES, 1048576, "VELO_MAX_REQUEST_BYTES", 10485760),
    apiRateLimitWindowMs: positiveInteger(env.VELO_RATE_LIMIT_WINDOW_MS, 60000, "VELO_RATE_LIMIT_WINDOW_MS", 3600000),
    apiRateLimitMaxRequests: positiveInteger(env.VELO_RATE_LIMIT_MAX_REQUESTS, 30, "VELO_RATE_LIMIT_MAX_REQUESTS", 10000),
    maxConcurrentModelRequests: positiveInteger(env.VELO_MAX_CONCURRENT_MODEL_REQUESTS, 6, "VELO_MAX_CONCURRENT_MODEL_REQUESTS", 64),
    modelPayloadLoggingEnabled: env.VELO_MODEL_PAYLOAD_LOGGING === "true",
    dataRetentionDays: positiveInteger(env.VELO_DATA_RETENTION_DAYS, 30, "VELO_DATA_RETENTION_DAYS", 3650),
    provider,
    ollamaBaseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    ollamaModel: env.OLLAMA_MODEL || "llama3.1",
    providerModel: env.VELO_MODEL || (provider === "ollama" ? (env.OLLAMA_MODEL || "llama3.1") : ""),
    ollamaTimeoutMs: positiveInteger(env.OLLAMA_TIMEOUT_MS, 60000, "OLLAMA_TIMEOUT_MS"),
    projectRoot: root,
    dataDir,
    rendersRoot: path.join(dataDir, "renders"),
    databasePath: path.join(dataDir, "velo.sqlite"),
    motionForgeExecutable: env.MOTIONFORGE_EXECUTABLE || path.resolve(root, "..", "MotionForge", "dist", "prompt-animator", "prompt-animator.exe"),
    motionForgeProvider,
    motionForgeModel: env.MOTIONFORGE_MODEL || "gpt-oss:120b-cloud",
    motionForgeStartupMs: positiveInteger(env.MOTIONFORGE_STARTUP_MS, 10000, "MOTIONFORGE_STARTUP_MS", 60000),
    motionForgeRequestTimeoutMs: positiveInteger(env.MOTIONFORGE_REQUEST_TIMEOUT_MS, 60000, "MOTIONFORGE_REQUEST_TIMEOUT_MS", 300000),
    renderConcurrency: positiveInteger(env.VELO_RENDER_CONCURRENCY, 1, "VELO_RENDER_CONCURRENCY", 8),
    maxQueuedAnimationJobs: positiveInteger(env.VELO_MAX_QUEUED_ANIMATION_JOBS, 8, "VELO_MAX_QUEUED_ANIMATION_JOBS", 1000),
    compileTimeoutMs: positiveInteger(env.VELO_COMPILE_TIMEOUT_MS, 120000, "VELO_COMPILE_TIMEOUT_MS"),
    simulationTimeoutMs: positiveInteger(env.VELO_SIMULATION_TIMEOUT_MS, 180000, "VELO_SIMULATION_TIMEOUT_MS"),
    exportTimeoutMs: positiveInteger(env.VELO_EXPORT_TIMEOUT_MS, 300000, "VELO_EXPORT_TIMEOUT_MS"),
    cleanupAfterHours: nonNegativeInteger(env.VELO_CLEANUP_AFTER_HOURS, 168, "VELO_CLEANUP_AFTER_HOURS"),
    maxRenderBytes: positiveInteger(env.VELO_MAX_RENDER_BYTES, 2147483648, "VELO_MAX_RENDER_BYTES"),
  });
}
