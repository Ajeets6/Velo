import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExplainService } from "../backend/explain-service.mjs";
import { validateExplainResponse } from "../backend/contracts.mjs";

test("Explain service creates validated structured sections and retains bounded context", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-explain-"));
  const config = { dataDir, databasePath: path.join(dataDir, "velo.sqlite") };
  const service = new ExplainService(config);
  try {
    const first = await service.create({ prompt: "Explain force and acceleration", learnerLevel: "current" });
    assert.equal(validateExplainResponse(first.response).ok, true);
    assert.equal(first.response.sections.some((section) => section.kind === "equation"), true);
    const followup = await service.create({ prompt: "Give me another force example", learnerLevel: "technical", sessionId: first.sessionId });
    assert.equal(followup.sessionId, first.sessionId);
    assert.equal(service.context(first.sessionId).recentPrompts.length, 2);
    assert.equal(followup.response.spokenText.includes("F = ma"), false);
  } finally { service.close(); await rm(dataDir, { recursive: true, force: true }); }
});
