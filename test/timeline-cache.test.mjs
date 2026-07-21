import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { TimelineCache } from "../backend/timeline-cache.mjs";

async function withCache(setup, check) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-timeline-cache-"));
  const databasePath = path.join(dataDir, "velo.sqlite");
  let cache;
  try {
    await setup(databasePath);
    cache = new TimelineCache({ databasePath, dataRetentionDays: 30 });
    await check(cache);
  } finally {
    cache?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("timeline cache writes to the current schema", async () => {
  await withCache(async () => {}, async (cache) => {
    const timeline = [{ time: 0, objects: [{ id: "ball", x: 0 }] }];
    assert.deepEqual(cache.put("visualization-1", timeline, { gravity: 9.81 }), {
      contractVersion: 1,
      visualizationId: "visualization-1",
      timeline,
      parameters: { gravity: 9.81 },
      cached: true,
    });
  });
});

test("timeline cache remains compatible with databases that require created_at", async () => {
  await withCache(async (databasePath) => {
    const database = new DatabaseSync(databasePath);
    database.exec(`CREATE TABLE visualization_timelines (
      visualization_id TEXT PRIMARY KEY,
      contract_version INTEGER NOT NULL,
      timeline_json TEXT NOT NULL,
      parameters_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    database.close();
  }, async (cache) => {
    const timeline = [{ time: 0, objects: [] }];
    assert.deepEqual(cache.put("visualization-2", timeline), {
      contractVersion: 1,
      visualizationId: "visualization-2",
      timeline,
      parameters: {},
      cached: true,
    });
  });
});
