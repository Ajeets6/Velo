import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const children = [
  spawn(process.execPath, [path.join(root, "backend", "server.mjs")], { cwd: root, stdio: "inherit" }),
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

