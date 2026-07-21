import { chmodSync, mkdirSync } from "node:fs";

// Windows ACLs are managed by the operating system. On POSIX, make sure Velo's
// local history and diagnostics are not created world-readable.
export function ensurePrivateDataDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { chmodSync(directory, 0o700); } catch {}
  }
}

export function restrictFileToUser(filePath) {
  if (process.platform !== "win32") {
    try { chmodSync(filePath, 0o600); } catch {}
  }
}
