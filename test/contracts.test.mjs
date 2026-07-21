import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_VERSION, requireValid, validateChatRequest, validateExplainResponse, validateGuideMessage, validateGuideSession, validateSceneSpec, validateTimeline, validateVisualizationEvent, validateVisualizationJob } from "../backend/contracts.mjs";
import { VeloError } from "../backend/errors.mjs";

test("chat request trims valid input and rejects invalid modes", () => {
  assert.deepEqual(validateChatRequest({ prompt: "  Explain gravity  ", mode: "explain" }), { ok: true, value: { prompt: "Explain gravity", mode: "explain" } });
  assert.equal(validateChatRequest({ prompt: "x", mode: "invalid" }).ok, false);
  assert.equal(validateChatRequest({ prompt: "" }).ok, false);
});

test("all Phase 0 versioned contracts accept valid representative values", () => {
  const base = { contractVersion: CONTRACT_VERSION };
  const sections = [{ kind: "intuition", text: "Masses attract." }, { kind: "equation", latex: "F = ma", spokenText: "force equals mass times acceleration" }];
  assert.equal(validateExplainResponse({ ...base, mode: "explain", title: "Gravity", summary: "A pull", sections, checkQuestion: "What changes?", visualSuggestion: null, spokenText: "Masses attract.", variants: { simpler: { summary: "A pull", sections: [sections[0]], spokenText: "Masses attract." }, structured: { summary: "A pull", sections, checkQuestion: "What changes?", spokenText: "Masses attract." }, technical: { summary: "A pull", sections, spokenText: "Masses attract." } } }).ok, true);
  assert.equal(validateGuideSession({ ...base, id: "guide-1", goal: "Find speed", known: ["height"], currentStep: 1, completedSteps: [0], misconceptions: [], hintLevel: 0 }).ok, true);
  assert.equal(validateGuideMessage({ ...base, feedback: "Correct", nextQuestion: "Why?", hint: null, progress: 0.5, isComplete: false }).ok, true);
  assert.equal(validateVisualizationJob({ ...base, id: "job-1", status: "running", stage: "Simulating", createdAt: new Date().toISOString() }).ok, true);
  assert.equal(validateVisualizationEvent({ ...base, jobId: "job-1", stage: "simulating", at: new Date().toISOString() }).ok, true);
  assert.equal(validateSceneSpec({ ...base, id: "scene-1", entities: [], world: {} }).ok, true);
  assert.equal(validateTimeline({ ...base, sceneId: "scene-1", durationMs: 2000, frames: [] }).ok, true);
});

test("explain contracts reject generic section tags", () => {
  const base = { contractVersion: CONTRACT_VERSION, mode: "explain", title: "Gravity", summary: "A pull", checkQuestion: "What changes?", visualSuggestion: null, spokenText: "Masses attract." };
  const genericTextSection = [{ kind: "text", text: "Masses attract." }];
  assert.equal(validateExplainResponse({ ...base, sections: genericTextSection, variants: { simpler: { summary: "A pull", sections: genericTextSection, spokenText: "Masses attract." }, structured: { summary: "A pull", sections: genericTextSection, spokenText: "Masses attract." }, technical: { summary: "A pull", sections: genericTextSection, spokenText: "Masses attract." } } }).ok, false);
});

test("explain contracts require LaTeX for equation sections", () => {
  const base = { contractVersion: CONTRACT_VERSION, mode: "explain", title: "Velocity", summary: "A rate", checkQuestion: "What is changing?", visualSuggestion: null, spokenText: "Velocity is change in position over time." };
  const equationWithoutLatex = [{ kind: "equation", text: "v equals delta r over delta t" }];
  assert.equal(validateExplainResponse({ ...base, sections: equationWithoutLatex, variants: { simpler: { summary: "A rate", sections: equationWithoutLatex, spokenText: base.spokenText }, structured: { summary: "A rate", sections: equationWithoutLatex, spokenText: base.spokenText }, technical: { summary: "A rate", sections: equationWithoutLatex, spokenText: base.spokenText } } }).ok, false);
});

test("contracts reject incompatible versions and required-field omissions", () => {
  const invalid = validateExplainResponse({ contractVersion: 2, mode: "explain", title: "x", summary: "x", sections: [], checkQuestion: "x", spokenText: "x" });
  assert.equal(invalid.ok, false);
  assert.throws(() => requireValid(invalid), (error) => error instanceof VeloError && error.code === "CONTRACT_MISMATCH");
});
