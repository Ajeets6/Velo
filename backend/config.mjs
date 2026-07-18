import path from "node:path";
import { VeloError } from "./errors.mjs";

function positiveInteger(value, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result <= 0 || result > max) throw new VeloError("INVALID_REQUEST", `${name} must be a positive integer.`);
  return result;
}

export function loadConfig(env = process.env, root = process.cwd()) {
  const provider = env.VELO_PROVIDER || "local";
  if (!["local", "ollama"].includes(provider)) throw new VeloError("INVALID_REQUEST", "VELO_PROVIDER must be local or ollama.");
  return Object.freeze({
    port: positiveInteger(env.VELO_API_PORT, 8787, "VELO_API_PORT", 65535),
    provider,
    ollamaBaseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    ollamaModel: env.OLLAMA_MODEL || "llama3.1",
    ollamaTimeoutMs: positiveInteger(env.OLLAMA_TIMEOUT_MS, 60000, "OLLAMA_TIMEOUT_MS"),
    projectRoot: root,
    rendersRoot: path.join(root, "renders"),
    motionForgeExecutable: env.MOTIONFORGE_EXECUTABLE || path.resolve(root, "..", "MotionForge", "dist", "prompt-animator.exe"),
    motionForgeModel: env.MOTIONFORGE_MODEL || "gpt-oss:120b-cloud",
  });
}
