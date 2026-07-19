import { DatabaseSync } from "node:sqlite";
export class TimelineCache {
  constructor(config) { this.db = new DatabaseSync(config.databasePath); this.db.exec("CREATE TABLE IF NOT EXISTS visualization_timelines (visualization_id TEXT PRIMARY KEY, contract_version INTEGER NOT NULL, timeline_json TEXT NOT NULL, parameters_json TEXT NOT NULL, updated_at TEXT NOT NULL)"); }
  get(id) { const row = this.db.prepare("SELECT * FROM visualization_timelines WHERE visualization_id=? AND contract_version=1").get(id); return row && { contractVersion: 1, visualizationId: id, timeline: JSON.parse(row.timeline_json), parameters: JSON.parse(row.parameters_json), cached: true }; }
  put(id, timeline, parameters = {}) { this.db.prepare("INSERT INTO visualization_timelines VALUES (?,1,?,?,?) ON CONFLICT(visualization_id) DO UPDATE SET timeline_json=excluded.timeline_json, parameters_json=excluded.parameters_json, updated_at=excluded.updated_at").run(id, JSON.stringify(timeline), JSON.stringify(parameters), new Date().toISOString()); return this.get(id); }
  invalidate(id) { this.db.prepare("DELETE FROM visualization_timelines WHERE visualization_id=?").run(id); }
  close() { this.db.close(); }
}
