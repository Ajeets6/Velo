import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExplainService } from "../backend/explain-service.mjs";
import { validateExplainResponse } from "../backend/contracts.mjs";

test("Explain service creates validated structured sections and retains bounded context", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-explain-"));
  const config = { dataDir, databasePath: path.join(dataDir, "velo.sqlite") };
  const service = new ExplainService(config);
  try {
    const first = await service.create({ prompt: "Explain force and acceleration", learnerLevel: "current" });
    assert.equal(validateExplainResponse(first.response).ok, true);
    assert.equal(first.response.sections.some((section) => section.kind === "equation"), true);
    const followup = await service.create({ prompt: "Give me another force example", learnerLevel: "technical", sessionId: first.sessionId });
    assert.equal(followup.sessionId, first.sessionId);
    assert.equal(service.context(first.sessionId).recentPrompts.length, 2);
    assert.equal(followup.response.spokenText.includes("F = ma"), false);
  } finally { service.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test("Explain service keeps valid model variants that omit server-owned metadata", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "velo-explain-"));
  const config = { dataDir, databasePath: path.join(dataDir, "velo.sqlite") };
  const provider = {
    name: "test-model",
    async generateStructured({ schema }) {
      const kinds = schema.$defs.section.properties.kind.enum;
      if (kinds.includes("detail")) {
        return {
          title: "Model-generated forces",
          summary: "A net force changes an object's motion.",
          sections: [
            { kind: "intuition", text: "A net force is an unbalanced push or pull." },
            { kind: "detail", text: "It changes velocity by causing acceleration." },
            { kind: "equation", latex: "F = ma" },
          ],
        };
      }
      if (kinds.includes("derivation")) {
        return {
          summary: "Forces determine acceleration through Newton's second law.",
          sections: [
            { kind: "definition", text: "Net force is the vector sum of forces." },
            { kind: "equation", latex: "F = ma" },
            { kind: "units", text: "Force is measured in newtons." },
          ],
        };
      }
      return {
        summary: "A push or pull can change motion.",
        sections: [{ kind: "intuition", text: "An unbalanced push or pull changes motion." }],
      };
    },
  };
  const service = new ExplainService(config, { provider });
  try {
    const { response } = await service.create({ prompt: "Explain force", learnerLevel: "current" });
    assert.equal(validateExplainResponse(response).ok, true);
    assert.equal(response.title, "Model-generated forces");
    assert.equal(response.variants.simpler.summary, "A push or pull can change motion.");
    assert.equal(response.variants.technical.sections[0].kind, "definition");
  } finally { service.close(); await rm(dataDir, { recursive: true, force: true }); }
});
