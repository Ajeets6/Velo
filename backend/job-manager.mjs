import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { VeloError } from "./errors.mjs";

const terminalStatuses = new Set(["complete", "failed", "cancelled"]);
const timestamp = () => new Date().toISOString();

function terminateProcessTree(child) {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
}

function managedPath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw new VeloError("INTERNAL_ERROR", "The managed render path is invalid.");
  return resolvedTarget;
}

export class AnimationJobManager {
  constructor(config, { log = () => {}, spawnProcess = spawn, terminate = terminateProcessTree } = {}) {
    this.config = config;
    this.log = log;
    this.spawnProcess = spawnProcess;
    this.terminate = terminate;
    this.running = new Map();
    this.pendingPrompts = new Map();
    mkdirSync(config.dataDir, { recursive: true });
    mkdirSync(config.rendersRoot, { recursive: true });
    this.db = new DatabaseSync(config.databasePath);
    this.migrate();
    this.recoverInterrupted();
    this.cleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS animation_jobs (
        id TEXT PRIMARY KEY, prompt_hash TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
        error_code TEXT, error_message TEXT, output_path TEXT NOT NULL, output_size INTEGER,
        created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL, cleanup_after TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS animation_jobs_queue ON animation_jobs(status, created_at);`);
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(timestamp());
    const columns = this.db.prepare("PRAGMA table_info(animation_jobs)").all().map((column) => column.name);
    if (!columns.includes("prompt")) this.db.exec("ALTER TABLE animation_jobs ADD COLUMN prompt TEXT NOT NULL DEFAULT ''");
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, ?)").run(timestamp());
  }

  recoverInterrupted() {
    const time = timestamp();
    this.db.prepare("UPDATE animation_jobs SET status = 'cancelled', stage = 'Cancelled after restart', error_code = 'CANCELLED', error_message = 'The application stopped before this animation completed.', completed_at = ?, updated_at = ? WHERE status IN ('queued', 'running')").run(time, time);
  }

  close() {
    clearInterval(this.cleanupTimer);
    for (const execution of this.running.values()) {
      clearTimeout(execution.timer);
      execution.terminating = true;
      try { this.terminate(execution.child); } catch {}
    }
    this.running.clear();
    this.pendingPrompts.clear();
    this.db.close();
  }
  row(id) { return this.db.prepare("SELECT * FROM animation_jobs WHERE id = ?").get(id); }

  publicJob(row) {
    if (!row) return null;
    const queuePosition = row.status === "queued" ? this.db.prepare("SELECT COUNT(*) AS count FROM animation_jobs WHERE status = 'queued' AND created_at < ?").get(row.created_at).count + 1 : null;
    return { id: row.id, prompt: row.prompt, status: row.status, stage: row.stage, error: row.error_code ? { code: row.error_code, message: row.error_message } : null, videoUrl: row.status === "complete" ? `/renders/${row.id}/animation.mp4` : null, createdAt: row.created_at, queuePosition };
  }

  get(id) { return this.publicJob(this.row(id)); }

  list({ limit = 20, offset = 0 } = {}) {
    const rows = this.db.prepare("SELECT * FROM animation_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
    return rows.map((row) => this.publicJob(row));
  }

  update(id, fields) {
    const values = { ...fields, updated_at: timestamp() };
    this.db.prepare(`UPDATE animation_jobs SET ${Object.keys(values).map((key) => `${key} = ?`).join(", ")} WHERE id = ?`).run(...Object.values(values), id);
    return this.row(id);
  }

  create(prompt) {
    const id = randomUUID();
    const outputPath = managedPath(this.config.rendersRoot, path.join(this.config.rendersRoot, id, "animation.mp4"));
    const time = timestamp();
    const hash = createHash("sha256").update(prompt).digest("hex");
    this.db.prepare("INSERT INTO animation_jobs(id, prompt_hash, prompt, status, stage, output_path, created_at, updated_at, cleanup_after) VALUES (?, ?, ?, 'queued', 'Queued for rendering', ?, ?, ?, ?)").run(id, hash, prompt, outputPath, time, time, new Date(Date.now() + this.config.cleanupAfterHours * 3600000).toISOString());
    this.log("info", "animation_queued", { jobId: id });
    this.pendingPrompts.set(id, prompt);
    this.pump();
    return this.get(id);
  }

  pump() {
    while (this.running.size < this.config.renderConcurrency) {
      const next = this.db.prepare("SELECT id FROM animation_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();
      if (!next) return;
      this.run(next.id);
    }
  }

  timeoutFor(stage) { return stage === "exporting" ? this.config.exportTimeoutMs : stage === "simulating" ? this.config.simulationTimeoutMs : this.config.compileTimeoutMs; }
  armTimeout(id, stage) {
    const execution = this.running.get(id);
    if (!execution) return;
    clearTimeout(execution.timer);
    execution.timer = setTimeout(() => this.fail(id, "TIMEOUT", `The ${stage} stage took too long.`), this.timeoutFor(stage));
  }

  setStage(id, stage, label) {
    const execution = this.running.get(id);
    if (!execution || execution.stage === stage) return;
    execution.stage = stage;
    this.update(id, { stage: label });
    this.armTimeout(id, stage);
  }

  run(id) {
    const job = this.row(id);
    if (!job || job.status !== "queued") return;
    if (!existsSync(this.config.motionForgeExecutable)) return this.fail(id, "MOTIONFORGE_UNAVAILABLE", "MotionForge is not installed or configured.");
    const outputDirectory = managedPath(this.config.rendersRoot, path.dirname(job.output_path));
    mkdirSync(outputDirectory, { recursive: true });
    this.update(id, { status: "running", stage: "Compiling the scene", started_at: timestamp(), error_code: null, error_message: null });
    const prompt = this.pendingPrompts.get(id);
    if (!prompt) return this.fail(id, "CANCELLED", "The application restarted before this queued animation could begin.");
    this.pendingPrompts.delete(id);
    const animationPrompt = `Create a clear, short educational physics animation for this request: ${prompt}. Use a white background, readable labels, physically plausible values, a duration of 2 to 3 seconds, and simple primitive shapes.`;
    const child = this.spawnProcess(this.config.motionForgeExecutable, [animationPrompt, "--provider", "ollama", "--model", this.config.motionForgeModel, "--quality", "low", "--output", job.output_path.slice(0, -4)], { cwd: outputDirectory, windowsHide: true, env: process.env });
    this.running.set(id, { child, timer: null, stage: "compiling" });
    this.armTimeout(id, "compiling");
    const handleOutput = (chunk) => {
      const text = chunk.toString();
      if (text.includes("[2/4]")) this.setStage(id, "simulating", "Simulating the physics");
      else if (text.includes("[3/4]")) this.setStage(id, "simulating", "Building the timeline");
      else if (text.includes("[4/4]")) this.setStage(id, "exporting", "Rendering the animation");
    };
    child.stdout?.on("data", handleOutput); child.stderr?.on("data", handleOutput);
    child.on("error", () => this.fail(id, "MOTIONFORGE_UNAVAILABLE", "MotionForge could not start."));
    child.on("exit", (code) => {
      if (!this.running.has(id) || this.running.get(id).terminating) return;
      if (code === 0 && existsSync(job.output_path)) this.finish(id, { status: "complete", stage: "Animation ready", output_size: statSync(job.output_path).size, completed_at: timestamp() });
      else this.fail(id, "EXPORT_FAILED", "MotionForge could not complete the animation.");
    });
  }

  finish(id, fields) {
    const execution = this.running.get(id);
    if (execution) { clearTimeout(execution.timer); this.running.delete(id); }
    this.update(id, fields);
    this.log("info", "animation_finished", { jobId: id, status: fields.status, code: fields.error_code });
    this.pump();
  }

  fail(id, code, message) {
    const job = this.row(id);
    if (!job || terminalStatuses.has(job.status)) return;
    const execution = this.running.get(id);
    if (execution) { execution.terminating = true; try { this.terminate(execution.child); } catch {} }
    this.finish(id, { status: code === "CANCELLED" ? "cancelled" : "failed", stage: code === "CANCELLED" ? "Animation cancelled" : "Animation failed", error_code: code, error_message: message, completed_at: timestamp() });
  }

  cancel(id) {
    const job = this.row(id);
    if (!job) throw new VeloError("NOT_FOUND", "Animation job not found.");
    this.pendingPrompts.delete(id);
    if (!terminalStatuses.has(job.status)) this.fail(id, "CANCELLED", "The animation was cancelled.");
    return this.get(id);
  }

  remove(id) {
    const job = this.row(id);
    if (!job) throw new VeloError("NOT_FOUND", "Animation job not found.");
    if (!terminalStatuses.has(job.status)) throw new VeloError("INVALID_REQUEST", "Cancel an active animation before deleting it.", { status: 409 });
    const directory = managedPath(this.config.rendersRoot, path.dirname(job.output_path));
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
    this.db.prepare("DELETE FROM animation_jobs WHERE id = ?").run(id);
    this.log("info", "animation_deleted", { jobId: id });
  }

  getOutputPath(id) {
    const job = this.row(id);
    if (!job || job.status !== "complete" || !existsSync(job.output_path)) return null;
    return managedPath(this.config.rendersRoot, job.output_path);
  }

  cleanup(referenceTime = Date.now()) {
    const jobs = this.db.prepare("SELECT * FROM animation_jobs WHERE status IN ('complete', 'failed', 'cancelled') ORDER BY completed_at ASC").all();
    let total = jobs.reduce((sum, job) => sum + (job.output_size || 0), 0);
    for (const job of jobs) {
      if (!(Date.parse(job.cleanup_after) <= referenceTime || total > this.config.maxRenderBytes)) continue;
      total -= job.output_size || 0;
      this.remove(job.id);
      this.log("info", "animation_cleaned", { jobId: job.id });
    }
  }
}
