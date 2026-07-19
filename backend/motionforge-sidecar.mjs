import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { VeloError } from "./errors.mjs";

export class MotionForgeSidecar {
  constructor({ executable, startupMs = 10000, log = () => {}, fetchImpl = fetch, spawnProcess = spawn } = {}) { this.executable = executable; this.startupMs = startupMs; this.log = log; this.fetch = fetchImpl; this.spawn = spawnProcess; this.child = null; this.baseUrl = null; this.secret = null; this.starting = null; }
  async start() {
    if (this.baseUrl) return this; if (this.starting) return this.starting;
    if (!this.executable || !existsSync(this.executable)) throw new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge is not installed or configured.");
    this.starting = new Promise((resolve, reject) => {
      const child = this.spawn(this.executable, ["serve", "--port", "0"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); this.child = child; let buffer = "";
      const timer = setTimeout(() => fail(new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge did not become ready in time.")), this.startupMs);
      const fail = (error) => { clearTimeout(timer); this.stop(); reject(error); };
      child.on("error", () => fail(new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge could not start.")));
      child.stdout?.on("data", (chunk) => { buffer += chunk; const line = buffer.split(/\r?\n/)[0]; if (!line) return; try { const ready = JSON.parse(line); if (ready.event !== "ready" || ready.contractVersion !== 1 || !ready.port || !ready.secret) return fail(new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge returned an incompatible ready response.")); clearTimeout(timer); this.baseUrl = `http://${ready.host || "127.0.0.1"}:${ready.port}`; this.secret = ready.secret; resolve(this); } catch {} });
    }).finally(() => { this.starting = null; });
    return this.starting;
  }
  async request(endpoint, options = {}) { await this.start(); const response = await this.fetch(`${this.baseUrl}${endpoint}`, { ...options, headers: { authorization: `Bearer ${this.secret}`, ...(options.headers || {}) } }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new VeloError("MOTIONFORGE_UNAVAILABLE", body.error?.message || "MotionForge could not complete that request.", { status: response.status }); } return response.json(); }
  async stream(endpoint, { lastEventId } = {}) { await this.start(); const response = await this.fetch(`${this.baseUrl}${endpoint}`, { headers: { authorization: `Bearer ${this.secret}`, accept: "text/event-stream", ...(lastEventId ? { "last-event-id": lastEventId } : {}) } }); if (!response.ok || !response.body) throw new VeloError("MOTIONFORGE_UNAVAILABLE", "MotionForge progress is unavailable."); return response; }
  async health() { return this.request("/v1/health"); }
  stop() { if (this.child && !this.child.killed) this.child.kill(); this.child = null; this.baseUrl = null; this.secret = null; }
}
