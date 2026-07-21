import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { VeloError } from "./errors.mjs";
import { ensurePrivateDataDirectory } from "./private-data.mjs";

const kinds = new Set(["tutor", "visualization", "interactive"]);
const now = () => new Date().toISOString();
const shortTitle = (text) => text.trim().replace(/\s+/g, " ").slice(0, 72) || "Untitled workspace";

export class WorkspaceStore {
  constructor(config) {
    ensurePrivateDataDirectory(config.dataDir);
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.db.exec(`CREATE TABLE IF NOT EXISTS workspace_threads (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_turns (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, turn_index INTEGER NOT NULL, mode TEXT NOT NULL, prompt TEXT NOT NULL,
      response_json TEXT, artifact_json TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES workspace_threads(id) ON DELETE CASCADE,
      UNIQUE(thread_id, turn_index)
    );
    CREATE INDEX IF NOT EXISTS workspace_threads_recent ON workspace_threads(kind, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workspace_turns_order ON workspace_turns(thread_id, turn_index);`);
    this.cleanup(config.dataRetentionDays ?? 30);
  }

  close() { this.db.close(); }
  assertKind(kind) { if (!kinds.has(kind)) throw new VeloError("INVALID_REQUEST", "Choose a valid workspace type."); }
  publicThread(row, turns = undefined) {
    if (!row) return null;
    const thread = { id: row.id, kind: row.kind, title: row.title, provider: row.provider, model: row.model, createdAt: row.created_at, updatedAt: row.updated_at };
    if (turns) thread.turns = turns.map((turn) => this.publicTurn(turn));
    return thread;
  }
  publicTurn(row) {
    return { id: row.id, index: row.turn_index, mode: row.mode, prompt: row.prompt, response: row.response_json ? JSON.parse(row.response_json) : null, artifact: row.artifact_json ? JSON.parse(row.artifact_json) : null, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  create({ kind, title = "", provider = "", model = "" }) {
    this.assertKind(kind);
    const id = randomUUID(); const time = now();
    this.db.prepare("INSERT INTO workspace_threads(id, kind, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, kind, shortTitle(title || `${kind} workspace`), provider, model, time, time);
    return this.get(id);
  }
  ensure({ id, kind, title, provider = "", model = "" }) {
    if (id) {
      const existing = this.get(id);
      if (!existing) throw new VeloError("NOT_FOUND", "Workspace not found.");
      if (existing.kind !== kind) throw new VeloError("INVALID_REQUEST", "This workspace belongs to a different mode.");
      return existing;
    }
    return this.create({ kind, title, provider, model });
  }
  list(kind, limit = 50) {
    if (kind) this.assertKind(kind);
    const rows = kind
      ? this.db.prepare("SELECT * FROM workspace_threads WHERE kind=? ORDER BY updated_at DESC LIMIT ?").all(kind, limit)
      : this.db.prepare("SELECT * FROM workspace_threads ORDER BY updated_at DESC LIMIT ?").all(limit);
    return rows.map((row) => this.publicThread(row));
  }
  get(id) {
    const row = this.db.prepare("SELECT * FROM workspace_threads WHERE id=?").get(id);
    if (!row) return null;
    const turns = this.db.prepare("SELECT * FROM workspace_turns WHERE thread_id=? ORDER BY turn_index").all(id);
    return this.publicThread(row, turns);
  }
  appendTurn({ threadId, mode, prompt, response = null, artifact = null, status = "pending" }) {
    if (typeof prompt !== "string" || !prompt.trim()) throw new VeloError("INVALID_REQUEST", "A workspace prompt is required.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const thread = this.get(threadId);
      if (!thread) throw new VeloError("NOT_FOUND", "Workspace not found.");
      const index = this.db.prepare("SELECT COALESCE(MAX(turn_index), 0) + 1 AS next_index FROM workspace_turns WHERE thread_id=?").get(threadId).next_index;
      const id = randomUUID(); const time = now();
      this.db.prepare("INSERT INTO workspace_turns(id, thread_id, turn_index, mode, prompt, response_json, artifact_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, threadId, index, mode, prompt.trim(), response ? JSON.stringify(response) : null, artifact ? JSON.stringify(artifact) : null, status, time, time);
      this.db.prepare("UPDATE workspace_threads SET title=CASE WHEN ?=1 THEN ? ELSE title END, updated_at=? WHERE id=?").run(index === 1 ? 1 : 0, shortTitle(prompt), time, threadId);
      this.db.exec("COMMIT");
      return this.publicTurn(this.db.prepare("SELECT * FROM workspace_turns WHERE id=?").get(id));
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }
  updateTurn(turnId, { response, artifact, status } = {}) {
    const row = this.db.prepare("SELECT * FROM workspace_turns WHERE id=?").get(turnId);
    if (!row) throw new VeloError("NOT_FOUND", "Workspace turn not found.");
    const fields = { response_json: response === undefined ? row.response_json : JSON.stringify(response), artifact_json: artifact === undefined ? row.artifact_json : JSON.stringify(artifact), status: status || row.status, updated_at: now() };
    this.db.prepare("UPDATE workspace_turns SET response_json=?, artifact_json=?, status=?, updated_at=? WHERE id=?").run(fields.response_json, fields.artifact_json, fields.status, fields.updated_at, turnId);
    this.db.prepare("UPDATE workspace_threads SET updated_at=? WHERE id=?").run(fields.updated_at, row.thread_id);
    return this.publicTurn(this.db.prepare("SELECT * FROM workspace_turns WHERE id=?").get(turnId));
  }
  context(threadId, beforeTurnId = null) {
    const rows = this.db.prepare("SELECT id, prompt FROM workspace_turns WHERE thread_id=? ORDER BY turn_index DESC LIMIT 6").all(threadId).reverse();
    return rows.filter((row) => row.id !== beforeTurnId).map((row) => row.prompt);
  }
  remove(id) {
    if (!this.get(id)) throw new VeloError("NOT_FOUND", "Workspace not found.");
    this.db.prepare("DELETE FROM workspace_turns WHERE thread_id=?").run(id);
    this.db.prepare("DELETE FROM workspace_threads WHERE id=?").run(id);
  }
  cleanup(retentionDays) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    this.db.prepare("DELETE FROM workspace_threads WHERE updated_at < ?").run(cutoff);
  }
}
