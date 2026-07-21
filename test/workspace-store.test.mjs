import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceStore } from "../backend/workspace-store.mjs";

test("workspaces persist isolated ordered turns and remove all thread data", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-workspaces-"));
  const store = new WorkspaceStore({ dataDir, databasePath: path.join(dataDir, "velo.sqlite") });
  try {
    const tutor = store.create({ kind: "tutor", title: "What is velocity?" });
    const visual = store.create({ kind: "visualization", title: "A ball on a ramp" });
    const first = store.appendTurn({ threadId: tutor.id, mode: "explain", prompt: "What is velocity?" });
    store.updateTurn(first.id, { response: { title: "Velocity" }, artifact: { explainSessionId: "session-1" }, status: "complete" });
    const second = store.appendTurn({ threadId: tutor.id, mode: "guide", prompt: "Is it similar to speed?" });
    store.updateTurn(second.id, { response: { currentQuestion: "What changes with direction?" }, status: "complete" });
    store.appendTurn({ threadId: visual.id, mode: "visualize", prompt: "Show a ball on a ramp" });

    const savedTutor = store.get(tutor.id);
    assert.equal(savedTutor.turns.length, 2);
    assert.equal(savedTutor.turns[0].response.title, "Velocity");
    assert.deepEqual(store.context(tutor.id, second.id), ["What is velocity?"]);
    assert.equal(store.get(visual.id).turns.length, 1);
    assert.equal(store.list("tutor").length, 1);

    store.remove(tutor.id);
    assert.equal(store.get(tutor.id), null);
    assert.equal(store.list("visualization").length, 1);
  } finally {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
