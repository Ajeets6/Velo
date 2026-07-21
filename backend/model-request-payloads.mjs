import { appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensurePrivateDataDirectory, restrictFileToUser } from "./private-data.mjs";

// This diagnostic capture contains complete model prompts and replies. It is
// deliberately opt-in so normal use never persists that sensitive content.
export class ModelRequestPayloadStore {
  constructor({ dataDir, enabled = false } = {}) {
    this.enabled = enabled;
    this.filePath = dataDir ? path.join(dataDir, "model_requests_payload.jsonl") : null;
  }

  async append(record) {
    if (!this.enabled || !this.filePath) return;
    ensurePrivateDataDirectory(path.dirname(this.filePath));
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    restrictFileToUser(this.filePath);
  }

  async begin({ provider, model, method, url, body }) {
    const id = randomUUID();
    await this.append({
      contractVersion: 1,
      id,
      sent: {
        at: new Date().toISOString(),
        provider,
        model,
        request: { method, url, body: body ?? null },
      },
    });
    return {
      complete: async ({ status, body: responseBody, error = null }) => this.append({
        contractVersion: 1,
        id,
        received: {
          at: new Date().toISOString(),
          provider,
          model,
          response: { status: status ?? null, body: responseBody ?? null, error },
        },
      }),
    };
  }
}
