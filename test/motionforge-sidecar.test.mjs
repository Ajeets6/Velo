import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MotionForgeSidecar } from "../backend/motionforge-sidecar.mjs";

test("sidecar receives cloud credentials only through its protected environment", async () => {
  let received;
  const spawnProcess = (_executable, _args, options) => {
    received = options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => { child.killed = true; };
    queueMicrotask(() => child.stdout.emit("data", Buffer.from('{"event":"ready","contractVersion":1,"host":"127.0.0.1","port":65000,"secret":"launch-secret"}\n')));
    return child;
  };
  const sidecar = new MotionForgeSidecar({ executable: process.execPath, environment: async () => ({ ...process.env, ANTHROPIC_API_KEY: "anthropic-secret" }), spawnProcess });
  await sidecar.start();
  assert.equal(received.env.ANTHROPIC_API_KEY, "anthropic-secret");
  assert.equal(received.stdio[0], "ignore");
  sidecar.stop();
});
