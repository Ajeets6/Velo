import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../backend/config.mjs";
import { errorPayload, VeloError } from "../backend/errors.mjs";
import { createLogger } from "../backend/logger.mjs";
import { createLocalProvider, createOllamaProvider } from "../backend/providers.mjs";

test("configuration validates provider and numeric values", () => {
  assert.equal(loadConfig({ VELO_PROVIDER: "local", OLLAMA_TIMEOUT_MS: "60000" }, "C:/velo").provider, "local");
  assert.throws(() => loadConfig({ VELO_PROVIDER: "unknown" }), VeloError);
  assert.throws(() => loadConfig({ VELO_API_PORT: "0" }), VeloError);
});

test("logger redacts prompt, credentials, and endpoint URL", () => {
  const entries = [];
  createLogger((line) => entries.push(JSON.parse(line)))("info", "event", { prompt: "student question", apiKey: "key", baseUrl: "http://secret", requestId: "safe" });
  assert.equal(entries[0].prompt, "[redacted]");
  assert.equal(entries[0].apiKey, "[redacted]");
  assert.equal(entries[0].baseUrl, "[redacted]");
  assert.equal(entries[0].requestId, "safe");
});

test("local provider implements the complete capability surface", async () => {
  const provider = createLocalProvider();
  assert.deepEqual(await provider.listModels(), []);
  assert.equal((await provider.health()).ok, true);
  assert.equal(typeof (await provider.generateText({ prompt: "gravity" })).answer, "string");
  assert.equal(await provider.cancel("request-1"), false);
  await assert.rejects(provider.generateStructured({}), (error) => error.code === "CONTRACT_MISMATCH");
});

test("Ollama provider maps network failures to stable errors", async () => {
  const provider = createOllamaProvider({ baseUrl: "http://127.0.0.1:11434", model: "test", timeoutMs: 50, fetchImpl: async () => { throw new TypeError("offline"); } });
  await assert.rejects(provider.health(), (error) => error.code === "MODEL_UNAVAILABLE");
});

test("error payload has a safe, versioned shape", () => {
  assert.deepEqual(errorPayload(new VeloError("MODEL_UNAVAILABLE", "Provider unavailable."), "request-1"), { contractVersion: 1, error: { code: "MODEL_UNAVAILABLE", message: "Provider unavailable.", requestId: "request-1" } });
});
