import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GuideService } from "../backend/guide-service.mjs";

test("Guide service persists one-question lesson state and actions", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-guide-"));
  const service = new GuideService({ dataDir, databasePath: path.join(dataDir, "velo.sqlite") });
  try {
    const session = service.create({ prompt: "Find the speed of a falling ball", learnerLevel: "current" });
    assert.match(session.currentQuestion, /What objects/);
    const hint = service.message(session.id, { action: "hint", answer: "" });
    assert.equal(hint.message.classification, "hint");
    const answer = service.message(session.id, { action: "answer", answer: "The object has mass and a downward force, so Newton's laws apply." });
    assert.equal(answer.currentStep, 1);
    const restarted = new GuideService({ dataDir, databasePath: path.join(dataDir, "velo.sqlite") });
    assert.equal(restarted.get(session.id).history.length, 2);
    restarted.close();
  } finally { service.close(); await rm(dataDir, { recursive: true, force: true }); }
});
