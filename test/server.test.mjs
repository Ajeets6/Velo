import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVeloServer } from "../backend/server.mjs";
import { VeloError } from "../backend/errors.mjs";

async function withServer(run, options = {}) {
  const logs = [];
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-server-"));
  const provider = { name: "fake", health: async () => ({ ok: true, provider: "fake", structuredOutput: true }), listModels: async () => ["fake"], generateText: async ({ prompt, mode }) => ({ title: "Test", answer: `${mode}: ${prompt}`, nextStep: "Next" }), generateStructured: async () => ({}), cancel: async () => false };
  const app = createVeloServer({ config: { provider: "local", dataDir, databasePath: path.join(dataDir, "velo.sqlite"), rendersRoot: path.join(dataDir, "renders"), motionForgeExecutable: "C:/missing.exe", motionForgeModel: "test", renderConcurrency: 1, compileTimeoutMs: 1000, simulationTimeoutMs: 1000, exportTimeoutMs: 1000, cleanupAfterHours: 24, maxRenderBytes: 1000000 }, provider, log: (level, event, fields) => logs.push({ level, event, fields }), ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  try { await run(`http://127.0.0.1:${address.port}`, logs); }
  finally { await new Promise((resolve, reject) => app.server.close((error) => error ? reject(error) : resolve())); app.close(); await rm(dataDir, { recursive: true, force: true }); }
}

test("health and chat endpoints expose a versioned contract", async () => withServer(async (base) => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).contractVersion, 1);
  const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "gravity", mode: "explain" }) });
  const body = await chat.json();
  assert.equal(chat.status, 200);
  assert.equal(body.contractVersion, 1);
  assert.equal(body.answer, "explain: gravity");
}));

test("API rejects cross-origin-friendly body types and does not emit permissive CORS", async () => withServer(async (base) => {
  const health = await fetch(`${base}/api/health`, { headers: { origin: "https://attacker.example" } });
  assert.equal(health.headers.get("access-control-allow-origin"), null);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ prompt: "gravity" }) });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error.code, "INVALID_REQUEST");
}));

test("animation history, cancellation, and deletion are exposed through the API", async () => {
  const job = { id: "11111111-1111-4111-8111-111111111111", prompt: "A pendulum swings.", status: "running", stage: "Compiling", error: null, videoUrl: null, createdAt: new Date().toISOString(), queuePosition: null };
  let deleted = false;
  const jobManager = {
    create: () => job,
    get: () => job,
    list: () => [job],
    cancel: () => ({ ...job, status: "cancelled", stage: "Animation cancelled", error: { code: "CANCELLED", message: "The animation was cancelled." } }),
    remove: () => { deleted = true; },
    getOutputPath: () => null,
    close: () => {},
  };
  await withServer(async (base) => {
    const history = await fetch(`${base}/api/animations?limit=10`);
    assert.equal((await history.json()).jobs[0].prompt, "A pendulum swings.");
    const response = await fetch(`${base}/api/animations/${job.id}/cancel`, { method: "POST" });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "cancelled");
    assert.equal(body.error.code, "CANCELLED");
    const deletion = await fetch(`${base}/api/animations/${job.id}`, { method: "DELETE" });
    assert.equal(deletion.status, 204);
    assert.equal(deleted, true);
  }, { jobManager });
});

test("invalid requests use stable error envelopes and request IDs", async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "" }) });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error.code, "CONTRACT_MISMATCH");
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("x-request-id"), body.error.requestId);
}));

test("Explain stream returns all explanation variants and completion speech", async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/explain/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain orbit simply", learnerLevel: "simpler" }) });
  const body = await response.text();
  assert.equal(response.headers.get("content-type").includes("text/event-stream"), true);
  assert.match(body, /event: meta/);
  assert.match(body, /"simpler"/);
  assert.match(body, /"structured"/);
  assert.match(body, /"technical"/);
  assert.match(body, /event: complete/);
}));

test("Guide session API creates, advances, and deletes a persistent lesson", async () => withServer(async (base) => {
  const created = await fetch(`${base}/api/guide/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain a falling ball" }) });
  const session = await created.json();
  assert.equal(created.status, 201);
  const hint = await fetch(`${base}/api/guide/sessions/${session.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "hint" }) });
  assert.equal((await hint.json()).message.classification, "hint");
  const removed = await fetch(`${base}/api/guide/sessions/${session.id}`, { method: "DELETE" });
  assert.equal(removed.status, 204);
}));

test("workspace API retains tutor chats while visualization modes avoid workspace memory", async () => {
  const requests = [];
  const motionForge = {
    request: async (pathname, options = {}) => {
      if (options.body) requests.push({ pathname, body: JSON.parse(options.body) });
      return { contractVersion: 1, visualizationId: "33333333-3333-4333-8333-333333333333" };
    },
    health: async () => ({ ok: true }), stream: async () => {}, stop: () => {},
  };
  const job = { id: "22222222-2222-4222-8222-222222222222", prompt: "A ball rolls", provider: "ollama", model: "physics", status: "queued", stage: "Queued", error: null, videoUrl: null, createdAt: new Date().toISOString(), queuePosition: 1 };
  const jobManager = { create: (prompt, _selection, { executionPrompt = prompt } = {}) => { requests.push({ pathname: "animation", prompt, executionPrompt }); return { ...job, prompt }; }, get: () => job, list: () => [], cancel: () => job, remove: () => {}, getOutputPath: () => null, close: () => {} };
  await withServer(async (base) => {
    const tutor = await fetch(`${base}/api/workspaces`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "tutor", title: "Velocity chat" }) });
    const tutorThread = await tutor.json();
    const explained = await fetch(`${base}/api/explain/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "What is velocity?", workspaceId: tutorThread.id }) });
    const stream = await explained.text();
    assert.match(stream, new RegExp(`workspaceId\\":\\"${tutorThread.id}`));
    const savedTutor = await (await fetch(`${base}/api/workspaces/${tutorThread.id}`)).json();
    assert.equal(savedTutor.turns.length, 1);
    assert.equal(savedTutor.turns[0].prompt, "What is velocity?");
    assert.equal(savedTutor.turns[0].status, "complete");

    const animation = await fetch(`${base}/api/animations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A ball rolls", provider: "ollama", model: "physics" }) });
    assert.equal(animation.status, 202);
    assert.equal((await animation.json()).workspaceId, undefined);
    assert.equal(requests.find((item) => item.prompt === "A ball rolls").executionPrompt, "A ball rolls");
    const interactive = await fetch(`${base}/api/visualizations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Show a pendulum", provider: "ollama", model: "physics" }) });
    assert.equal(interactive.status, 202);
    assert.equal((await interactive.json()).workspaceId, undefined);
    assert.equal(requests.find((item) => item.pathname === "/v1/visualizations").body.prompt, "Show a pendulum");
    assert.equal((await (await fetch(`${base}/api/workspaces?kind=tutor`)).json()).workspaces.length, 1);
    assert.equal((await fetch(`${base}/api/workspaces/${tutorThread.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(`${base}/api/workspaces/${tutorThread.id}`)).status, 404);
  }, { motionForge, jobManager });
});

test("selected provider and model are applied to tutor, guide, legacy animation, and sidecar requests", async () => {
  const selections = [];
  const providerFactory = (config) => ({
    name: config.provider,
    health: async () => ({ ok: true }),
    listModels: async () => [],
    generateText: async ({ prompt, mode }) => { selections.push({ path: mode, provider: config.provider, model: config.ollamaModel, prompt }); return { title: "Selected", answer: "Selected provider response", nextStep: "Next" }; },
    generateStructured: async ({ mode }) => { selections.push({ path: mode, provider: config.provider, model: config.ollamaModel }); return {}; },
    cancel: async () => false,
  });
  let animationSelection;
  let sidecarPayload;
  const job = { id: "22222222-2222-4222-8222-222222222222", prompt: "A pendulum", provider: "ollama", model: "physics-model", status: "queued", stage: "Queued", error: null, videoUrl: null, createdAt: new Date().toISOString(), queuePosition: 1 };
  const jobManager = { create: (_prompt, selection) => { animationSelection = selection; return job; }, get: () => job, list: () => [], cancel: () => job, remove: () => {}, getOutputPath: () => null, close: () => {} };
  const motionForge = { request: async (_path, options) => { sidecarPayload = JSON.parse(options.body); return { contractVersion: 1, visualizationId: "33333333-3333-4333-8333-333333333333" }; }, health: async () => ({ ok: true }), stream: async () => {}, stop: () => {} };
  await withServer(async (base) => {
    const selected = { provider: "ollama", model: "physics-model" };
    const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "gravity", mode: "explain", ...selected }) });
    assert.equal((await chat.json()).model, "physics-model");
    const guide = await fetch(`${base}/api/guide/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "falling ball", ...selected }) });
    assert.equal((await guide.json()).model, "physics-model");
    await fetch(`${base}/api/animations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A pendulum", ...selected }) });
    assert.deepEqual(animationSelection, selected);
    await fetch(`${base}/api/visualizations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A pendulum", ...selected }) });
    assert.equal(sidecarPayload.provider, "ollama");
    assert.equal(sidecarPayload.model, "physics-model");
    assert.equal(selections.some((entry) => entry.model === "physics-model"), true);
  }, { providerFactory, jobManager, motionForge });
});

test("settings credentials stay backend-only and cloud connection tests call the selected model", async () => {
  const saved = new Map([["anthropic", "stored-anthropic-key"]]);
  const credentials = {
    save: async (provider, key) => { if (key.length < 8) throw new VeloError("INVALID_REQUEST", "Enter a valid API key."); saved.set(provider, key); },
    get: async (provider) => saved.get(provider) || null,
    has: async (provider) => saved.has(provider),
    remove: async (provider) => saved.delete(provider),
  };
  const calls = [];
  const providerFactory = (config) => ({ name: config.provider, health: async () => { calls.push({ type: "health", ...config }); return { ok: true }; }, listModels: async () => [], generateText: async () => { calls.push({ type: "generate", ...config }); return { answer: "OK" }; }, generateStructured: async () => ({}), cancel: async () => false });
  await withServer(async (base) => {
    const providers = await fetch(`${base}/api/settings/providers`);
    assert.equal((await providers.json()).providers.some((item) => item.id === "openai"), true);
    const before = await fetch(`${base}/api/settings/credentials`);
    assert.deepEqual(await before.json(), { contractVersion: 1, storage: { available: true }, openai: false, anthropic: true });
    const save = await fetch(`${base}/api/settings/credentials`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", apiKey: "openai-secret" }) });
    assert.equal(save.status, 204);
    assert.equal(saved.get("openai"), "openai-secret");
    const tested = await fetch(`${base}/api/settings/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", model: "gpt-test" }) });
    assert.equal(tested.status, 200);
    assert.equal(calls.some((call) => call.type === "health" && call.provider === "openai" && call.model === "gpt-test" && call.apiKey === "openai-secret"), true);
    assert.equal(calls.some((call) => call.type === "generate" && call.provider === "openai"), true);
    const deleted = await fetch(`${base}/api/settings/credentials/openai`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
    assert.equal(saved.has("openai"), false);
    const invalid = await fetch(`${base}/api/settings/credentials`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", apiKey: "short" }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "INVALID_REQUEST");
  }, { credentials, providerFactory });
});

test("credential-manager failures return a safe settings error", async () => {
  const credentials = { save: async () => { throw new VeloError("INTERNAL_ERROR", "Credential storage could not be completed."); }, get: async () => { throw new VeloError("INTERNAL_ERROR", "Windows Credential Manager is unavailable."); }, has: async () => false, remove: async () => {} };
  await withServer(async (base) => {
    const save = await fetch(`${base}/api/settings/credentials`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", apiKey: "openai-secret" }) });
    assert.equal(save.status, 500);
    assert.equal((await save.json()).error.code, "INTERNAL_ERROR");
    const testConnection = await fetch(`${base}/api/settings/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", model: "gpt-test" }) });
    assert.equal(testConnection.status, 500);
    assert.equal((await testConnection.json()).error.code, "INTERNAL_ERROR");
  }, { credentials });
});
