import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// This is a local diagnostic/audit log. It intentionally stores complete model
// request and response bodies, so it must remain outside the repository and
// must never receive credential headers or API keys.
export class ModelRequestPayloadStore {
  constructor({ dataDir, enabled = true } = {}) {
    this.enabled = enabled;
    this.filePath = dataDir ? path.join(dataDir, "model_requests_payload.jsonl") : null;
  }

  async append(record) {
    if (!this.enabled || !this.filePath) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
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
