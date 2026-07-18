import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const backendEnv = {
  ...process.env,
  VELO_PROVIDER: process.env.VELO_PROVIDER || "ollama",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b",
  OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS || "60000",
  MOTIONFORGE_MODEL: process.env.MOTIONFORGE_MODEL || "gpt-oss:120b-cloud",
};
const children = [
  spawn(process.execPath, [path.join(root, "backend", "server.mjs")], { cwd: root, stdio: "inherit", env: backendEnv }),
  spawn(process.execPath, [viteBin, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" }),
];

function stop() {
  children.forEach((child) => child.kill("SIGTERM"));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", (code) => {
  if (code && code !== 0) process.exitCode = code;
}));
