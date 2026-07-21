import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../backend/config.mjs";
import { errorPayload, VeloError } from "../backend/errors.mjs";
import { createLogger } from "../backend/logger.mjs";
import { createAnthropicProvider, createLocalProvider, createOllamaProvider, createOpenAIProvider } from "../backend/providers.mjs";
import { resolveMotionForgeSelection, resolveTutorSelection } from "../backend/model-selection.mjs";

test("configuration validates provider and numeric values", () => {
  assert.equal(loadConfig({ VELO_PROVIDER: "local", OLLAMA_TIMEOUT_MS: "60000" }, "C:/velo").provider, "local");
  assert.throws(() => loadConfig({ VELO_PROVIDER: "unknown" }), VeloError);
  assert.throws(() => loadConfig({ VELO_API_PORT: "0" }), VeloError);
});

test("provider selections use safe defaults and reject unsupported configurations", () => {
  const config = { provider: "local", ollamaModel: "llama3.1", motionForgeProvider: "ollama", motionForgeModel: "motion-model" };
  assert.deepEqual(resolveTutorSelection({}, config), { provider: "local", model: "" });
  assert.deepEqual(resolveTutorSelection({ provider: "ollama", model: "physics-model" }, config), { provider: "ollama", model: "physics-model" });
  assert.deepEqual(resolveMotionForgeSelection({}, config), { provider: "ollama", model: "motion-model" });
  assert.throws(() => resolveTutorSelection({ provider: "ollama" }, config), VeloError);
  assert.throws(() => resolveMotionForgeSelection({ provider: "openai", model: "gpt-test" }, config), VeloError);
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

test("OpenAI and Anthropic providers call their server APIs with secure headers", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("openai.com")) return { ok: true, json: async () => ({ output_text: "OpenAI response" }) };
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "Anthropic response" }] }) };
  };
  const openai = createOpenAIProvider({ apiKey: "openai-secret", model: "gpt-test", timeoutMs: 100, fetchImpl });
  const anthropic = createAnthropicProvider({ apiKey: "anthropic-secret", model: "claude-test", timeoutMs: 100, fetchImpl });
  assert.equal((await openai.generateText({ prompt: "gravity" })).answer, "OpenAI response");
  assert.equal((await anthropic.generateText({ prompt: "gravity" })).answer, "Anthropic response");
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.headers.authorization, "Bearer openai-secret");
  assert.equal(calls[1].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[1].options.headers["x-api-key"], "anthropic-secret");
  assert.equal(calls[1].options.headers["anthropic-version"], "2023-06-01");
});

test("error payload has a safe, versioned shape", () => {
  assert.deepEqual(errorPayload(new VeloError("MODEL_UNAVAILABLE", "Provider unavailable."), "request-1"), { contractVersion: 1, error: { code: "MODEL_UNAVAILABLE", message: "Provider unavailable.", requestId: "request-1" } });
});
