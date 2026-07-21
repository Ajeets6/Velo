import { DatabaseSync } from "node:sqlite";

export class TimelineCache {
  constructor(config) {
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS visualization_timelines (
        visualization_id TEXT PRIMARY KEY,
        contract_version INTEGER NOT NULL,
        timeline_json TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.migrate();
    this.cleanup(config.dataRetentionDays ?? 30);
  }

  migrate() {
    const columns = this.db.prepare("PRAGMA table_info(visualization_timelines)").all().map((column) => column.name);
    if (!columns.includes("parameters_json")) {
      this.db.exec("ALTER TABLE visualization_timelines ADD COLUMN parameters_json TEXT NOT NULL DEFAULT '{}'");
    }
    this.hasCreatedAt = columns.includes("created_at");
  }

  get(id) {
    const row = this.db.prepare("SELECT * FROM visualization_timelines WHERE visualization_id=? AND contract_version=1").get(id);
    return row && {
      contractVersion: 1,
      visualizationId: id,
      timeline: JSON.parse(row.timeline_json),
      parameters: JSON.parse(row.parameters_json),
      cached: true,
    };
  }

  put(id, timeline, parameters = {}) {
    const time = new Date().toISOString();
    const statement = this.hasCreatedAt
      ? `INSERT INTO visualization_timelines (visualization_id, contract_version, timeline_json, parameters_json, created_at, updated_at)
           VALUES (?, 1, ?, ?, ?, ?)
           ON CONFLICT(visualization_id) DO UPDATE SET
             contract_version=excluded.contract_version,
             timeline_json=excluded.timeline_json,
             parameters_json=excluded.parameters_json,
             updated_at=excluded.updated_at`
      : `INSERT INTO visualization_timelines (visualization_id, contract_version, timeline_json, parameters_json, updated_at)
           VALUES (?, 1, ?, ?, ?)
           ON CONFLICT(visualization_id) DO UPDATE SET
             contract_version=excluded.contract_version,
             timeline_json=excluded.timeline_json,
             parameters_json=excluded.parameters_json,
             updated_at=excluded.updated_at`;
    const values = [id, JSON.stringify(timeline), JSON.stringify(parameters), ...(this.hasCreatedAt ? [time] : []), time];
    this.db.prepare(statement).run(...values);
    return this.get(id);
  }

  invalidate(id) {
    this.db.prepare("DELETE FROM visualization_timelines WHERE visualization_id=?").run(id);
  }

  cleanup(retentionDays) {
    this.db.prepare("DELETE FROM visualization_timelines WHERE updated_at < ?").run(new Date(Date.now() - retentionDays * 86400000).toISOString());
  }

  close() {
    this.db.close();
  }
}
