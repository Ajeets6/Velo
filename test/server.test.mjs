import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVeloServer } from "../backend/server.mjs";

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

test("Explain stream returns metadata, structured sections, and completion speech", async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/explain/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain orbit simply", learnerLevel: "simpler" }) });
  const body = await response.text();
  assert.equal(response.headers.get("content-type").includes("text/event-stream"), true);
  assert.match(body, /event: meta/);
  assert.match(body, /event: section/);
  assert.match(body, /event: complete/);
}));
