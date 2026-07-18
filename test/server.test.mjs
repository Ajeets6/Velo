import test from "node:test";
import assert from "node:assert/strict";
import { createVeloServer } from "../backend/server.mjs";

async function withServer(run) {
  const logs = [];
  const provider = { name: "fake", health: async () => ({ ok: true, provider: "fake", structuredOutput: true }), listModels: async () => ["fake"], generateText: async ({ prompt, mode }) => ({ title: "Test", answer: `${mode}: ${prompt}`, nextStep: "Next" }), generateStructured: async () => ({}), cancel: async () => false };
  const app = createVeloServer({ config: { provider: "local", rendersRoot: "C:/unused", motionForgeExecutable: "C:/missing.exe", motionForgeModel: "test" }, provider, log: (level, event, fields) => logs.push({ level, event, fields }) });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  try { await run(`http://127.0.0.1:${address.port}`, logs); }
  finally { await new Promise((resolve, reject) => app.server.close((error) => error ? reject(error) : resolve())); }
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

test("invalid requests use stable error envelopes and request IDs", async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "" }) });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error.code, "CONTRACT_MISMATCH");
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("x-request-id"), body.error.requestId);
}));
