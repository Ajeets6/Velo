import assert from "node:assert/strict";
import test from "node:test";
import { createCredentialStore } from "../backend/credential-store.mjs";
import { VeloError } from "../backend/errors.mjs";

function keychain() {
  const entries = new Map();
  return {
    entries,
    async setPassword(service, account, value) { entries.set(`${service}/${account}`, value); return true; },
    async getPassword(service, account) { return entries.get(`${service}/${account}`) || null; },
    async deletePassword(service, account) { return entries.delete(`${service}/${account}`); },
    async findCredentials(service) { return [...entries].filter(([key]) => key.startsWith(`${service}/`)).map(([key, password]) => ({ account: key.slice(service.length + 1), password })); },
  };
}

test("credential store uses the OS keychain contract without exposing provider keys", async () => {
  const vault = keychain();
  const store = createCredentialStore({ keychain: vault, platform: "darwin" });
  assert.deepEqual(await store.status(), { available: true });
  await store.save("openai", "openai-secret");
  assert.equal(await store.has("openai"), true);
  assert.equal(await store.get("openai"), "openai-secret");
  await store.remove("openai");
  assert.equal(await store.get("openai"), null);
  await assert.rejects(() => store.save("ollama", "not-a-cloud-key"), VeloError);
});

test("Windows credentials migrate once from the legacy Velo target", async () => {
  const vault = keychain();
  const operations = [];
  const store = createCredentialStore({ keychain: vault, platform: "win32", legacyWindowsReader: async (action) => { operations.push(action); return action === "read" ? "legacy-openai-key" : null; } });
  assert.equal(await store.get("openai"), "legacy-openai-key");
  assert.equal(await vault.getPassword("Velo Secure", "openai"), "legacy-openai-key");
  assert.deepEqual(operations, ["read", "remove"]);
});

test("credential store reports an unavailable secure vault without a plaintext fallback", async () => {
  const store = createCredentialStore({ keychain: { async findCredentials() { throw new Error("locked"); }, async getPassword() { throw new Error("locked"); } }, platform: "linux" });
  assert.deepEqual(await store.status(), { available: false, reason: "A Secret Service-compatible keyring is unavailable or locked." });
  await assert.rejects(() => store.get("openai"), VeloError);
});
