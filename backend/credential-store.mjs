import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import keytar from "keytar";
import { VeloError } from "./errors.mjs";

// A distinct service name prevents keytar's UTF-8 credential blobs from being
// confused with Velo's older UTF-16 PowerShell Credential Manager entries.
const SERVICE = "Velo Secure";
const allowed = new Set(["openai", "anthropic"]);
const windowsHelper = fileURLToPath(new URL("./windows-credentials.ps1", import.meta.url));

function assertProvider(provider) {
  if (!allowed.has(provider)) throw new VeloError("INVALID_REQUEST", "This provider does not use a cloud API key.");
}

function unavailable() {
  return new VeloError("INTERNAL_ERROR", "Secure credential storage is unavailable on this system.");
}

function validateKey(key) {
  if (typeof key !== "string" || key.trim().length < 8 || key.length > 500) throw new VeloError("INVALID_REQUEST", "Enter a valid API key.");
  return key.trim();
}

function runLegacyWindowsCredential(action, provider) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", windowsHelper, "-Action", action, "-Target", `Velo/${provider}`], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => code === 0 ? resolve(output.trim() || null) : resolve(null));
  });
}

export function createCredentialStore({ keychain = keytar, platform = process.platform, legacyWindowsReader = runLegacyWindowsCredential } = {}) {
  async function get(provider) {
    assertProvider(provider);
    let stored;
    try {
      stored = await keychain.getPassword(SERVICE, provider);
    } catch {
      throw unavailable();
    }
    if (stored || platform !== "win32") return stored || null;

    // Migrate keys written by Velo's former PowerShell-only Credential Manager adapter.
    const legacy = await legacyWindowsReader("read", provider);
    if (!legacy) return null;
    try {
      const saved = await keychain.setPassword(SERVICE, provider, legacy);
      if (!saved) throw new Error("save failed");
      await legacyWindowsReader("remove", provider);
      return legacy;
    } catch {
      throw unavailable();
    }
  }

  return Object.freeze({
    async save(provider, key) {
      assertProvider(provider);
      try {
        const saved = await keychain.setPassword(SERVICE, provider, validateKey(key));
        if (!saved) throw new Error("save failed");
      } catch (error) {
        if (error instanceof VeloError) throw error;
        throw unavailable();
      }
    },
    get,
    async has(provider) { return Boolean(await get(provider)); },
    async remove(provider) {
      assertProvider(provider);
      try {
        await keychain.deletePassword(SERVICE, provider);
        if (platform === "win32") await legacyWindowsReader("remove", provider);
      } catch {
        throw unavailable();
      }
    },
    async status() {
      if (!["win32", "darwin", "linux"].includes(platform)) return { available: false, reason: "This operating system does not provide a supported credential vault." };
      try {
        await keychain.findCredentials(SERVICE);
        return { available: true };
      } catch {
        return { available: false, reason: platform === "linux" ? "A Secret Service-compatible keyring is unavailable or locked." : "The system credential vault is unavailable." };
      }
    },
  });
}

export const credentialStore = createCredentialStore();
