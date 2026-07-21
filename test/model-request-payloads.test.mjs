import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ModelRequestPayloadStore } from "../backend/model-request-payloads.mjs";
import { createOllamaProvider } from "../backend/providers.mjs";

test("stores the complete request before sending and the raw response after receiving", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-model-payloads-"));
  try {
    const store = new ModelRequestPayloadStore({ dataDir });
    const provider = createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "physics-test",
      timeoutMs: 100,
      payloadStore: store,
      fetchImpl: async () => new Response(JSON.stringify({ message: { content: "Model answer" }, metadata: { complete: true } }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    assert.equal((await provider.generateText({ prompt: "Explain gravity", mode: "explain" })).answer, "Model answer");
    const records = (await readFile(path.join(dataDir, "model_requests_payload.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(records.length, 2);
    assert.match(records[0].sent.request.body, /Explain gravity/);
    assert.match(records[1].received.response.body, /Model answer/);
    assert.equal(records[0].id, records[1].id);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
