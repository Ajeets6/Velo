import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnimationJobManager } from "../backend/job-manager.mjs";

async function withManager(run, overrides = {}, dependencies = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-jobs-"));
  const children = [];
  const config = { dataDir, databasePath: path.join(dataDir, "velo.sqlite"), rendersRoot: path.join(dataDir, "renders"), motionForgeExecutable: process.execPath, motionForgeModel: "test", renderConcurrency: 1, compileTimeoutMs: 80, simulationTimeoutMs: 80, exportTimeoutMs: 80, cleanupAfterHours: 24, maxRenderBytes: 1000000, ...overrides };
  const commands = [];
  const spawnProcess = (...args) => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {}; children.push(child); commands.push(args); return child; };
  const manager = new AnimationJobManager(config, { spawnProcess, ...dependencies });
  try { await run({ manager, config, children, commands }); } finally { try { manager.close(); } catch {} await rm(dataDir, { recursive: true, force: true }); }
}

test("queues work, limits concurrency, and starts the next job after completion", async () => withManager(async ({ manager, children, config }) => {
  const first = manager.create("first animation");
  const second = manager.create("second animation");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.status, "running");
  assert.equal(second.status, "queued");
  assert.equal(second.queuePosition, 1);
  const output = path.join(config.rendersRoot, first.id, "animation.mp4");
  await writeFile(output, "video");
  children[0].emit("exit", 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.get(first.id).status, "complete");
  assert.equal(manager.get(second.id).status, "running");
  assert.equal(children.length, 2);
}));

test("cancels queued and running jobs idempotently", async () => withManager(async ({ manager, children }) => {
  const running = manager.create("running");
  const queued = manager.create("queued");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.cancel(queued.id).status, "cancelled");
  assert.equal(manager.cancel(queued.id).status, "cancelled");
  assert.equal(manager.cancel(running.id).status, "cancelled");
  assert.equal(children.length, 1);
}));

test("marks timed-out work with a stable error and releases the queue", async () => withManager(async ({ manager }) => {
  const job = manager.create("timeout");
  await new Promise((resolve) => setTimeout(resolve, 130));
  const result = manager.get(job.id);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "TIMEOUT");
}));

test("recovers interrupted jobs from SQLite on startup", async () => withManager(async ({ manager, config }) => {
  manager.db.prepare("INSERT INTO animation_jobs(id, prompt_hash, prompt, status, stage, output_path, created_at, updated_at, cleanup_after) VALUES ('interrupted', 'hash', 'saved prompt', 'running', 'Simulating', ?, ?, ?, ?)").run(path.join(config.rendersRoot, "interrupted", "animation.mp4"), new Date().toISOString(), new Date().toISOString(), new Date(Date.now() + 100000).toISOString());
  manager.close();
  const recovered = new AnimationJobManager(config);
  assert.equal(recovered.get("interrupted").status, "cancelled");
  assert.equal(recovered.get("interrupted").error.code, "CANCELLED");
  recovered.close();
}));

test("persists prompts, lists history, and deletes managed job data", async () => withManager(async ({ manager, config, children }) => {
  const prompt = "A ball bounces once; it's not SQL.";
  const job = manager.create(prompt);
  assert.equal(manager.get(job.id).prompt, prompt);
  assert.equal(manager.list().at(0).id, job.id);
  const output = path.join(config.rendersRoot, job.id, "animation.mp4");
  await writeFile(output, "video"); children[0].emit("exit", 0);
  manager.remove(job.id);
  assert.equal(manager.get(job.id), null);
}));

test("cleans expired output only inside the managed render directory", async () => withManager(async ({ manager, config, children }) => {
  const job = manager.create("expired");
  const output = path.join(config.rendersRoot, job.id, "animation.mp4");
  await writeFile(output, "video"); children[0].emit("exit", 0);
  manager.db.prepare("UPDATE animation_jobs SET cleanup_after = ? WHERE id = ?").run(new Date(0).toISOString(), job.id);
  manager.cleanup();
  assert.equal(manager.getOutputPath(job.id), null);
}));

test("cloud render credentials are placed only in the child environment", async () => withManager(async ({ manager, commands }) => {
  manager.create("cloud render", { provider: "anthropic", model: "claude-test" });
  await new Promise((resolve) => setImmediate(resolve));
  const [executable, args, options] = commands[0];
  assert.equal(executable, process.execPath);
  assert.deepEqual(args.slice(1, 5), ["--provider", "anthropic", "--model", "claude-test"]);
  assert.equal(args.includes("anthropic-secret"), false);
  assert.equal(options.env.ANTHROPIC_API_KEY, "anthropic-secret");
}, {}, { environmentForProvider: async (provider) => ({ ...process.env, ...(provider === "anthropic" ? { ANTHROPIC_API_KEY: "anthropic-secret" } : {}) }) }));
