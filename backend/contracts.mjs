import { VeloError } from "./errors.mjs";

export const CONTRACT_VERSION = 1;
export const LEARNING_MODES = Object.freeze(["explain", "guide", "visualize"]);
export const JOB_STATUSES = Object.freeze(["queued", "running", "complete", "failed", "cancelled"]);
export const VISUALIZATION_STAGES = Object.freeze(["queued", "compiling", "validating", "simulating", "ready", "exporting", "failed", "cancelled"]);
export const EXPLAIN_SECTION_KINDS = Object.freeze(["intuition", "detail", "equation", "example", "assumptions", "recap", "definition", "derivation", "units", "limitations"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => typeof value === "string" && value.length >= min && value.length <= max;
const isStringArray = (value) => Array.isArray(value) && value.every((item) => isString(item));
const issue = (path, message) => ({ path, message });
const isExplainSectionKind = (value) => EXPLAIN_SECTION_KINDS.includes(value);

function versionIssues(value) {
  return value.contractVersion === CONTRACT_VERSION ? [] : [issue("contractVersion", `must equal ${CONTRACT_VERSION}`)];
}

function result(value, issues) {
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

export function validateChatRequest(value) {
  const issues = [];
  if (!isRecord(value)) return result(value, [issue("body", "must be an object")]);
  if (!isString(value.prompt?.trim(), { min: 1, max: 2000 })) issues.push(issue("prompt", "must be 1–2,000 characters"));
  if (value.mode !== undefined && !LEARNING_MODES.includes(value.mode)) issues.push(issue("mode", "must be explain, guide, or visualize"));
  return result({ prompt: value.prompt?.trim(), mode: value.mode || "explain" }, issues);
}

export function validateExplainRequest(value) {
  const base = validateChatRequest({ ...value, mode: "explain" });
  if (!base.ok) return base;
  const issues = [];
  if (value.sessionId !== undefined && !isString(value.sessionId, { min: 1, max: 100 })) issues.push(issue("sessionId", "must be a short string"));
  if (value.learnerLevel !== undefined && !["simpler", "current", "technical"].includes(value.learnerLevel)) issues.push(issue("learnerLevel", "must be simpler, current, or technical"));
  return result({ prompt: base.value.prompt, sessionId: value.sessionId, learnerLevel: value.learnerLevel || "current" }, issues);
}

export function validateExplainResponse(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (value.mode !== "explain") issues.push(issue("mode", "must be explain"));
  for (const key of ["title", "summary", "checkQuestion", "spokenText"]) if (!isString(value[key], { min: 1 })) issues.push(issue(key, "must be a non-empty string"));
  if (!Array.isArray(value.sections) || value.sections.length === 0) issues.push(issue("sections", "must contain at least one section"));
  else value.sections.forEach((section, index) => {
    if (!isRecord(section) || !isString(section.kind, { min: 1 })) issues.push(issue(`sections[${index}]`, "must have a kind"));
    else if (!isExplainSectionKind(section.kind)) issues.push(issue(`sections[${index}].kind`, "is not a supported explanation section"));
    if (!isString(section?.text) && !isString(section?.latex)) issues.push(issue(`sections[${index}]`, "must have text or latex"));
    if (section?.kind === "equation" && !isString(section.latex, { min: 1 })) issues.push(issue(`sections[${index}].latex`, "must contain KaTeX-compatible LaTeX for an equation"));
    if (section?.spokenText !== undefined && !isString(section.spokenText)) issues.push(issue(`sections[${index}].spokenText`, "must be a string"));
  });
  if (!isRecord(value.variants)) issues.push(issue("variants", "must contain simpler, structured, and technical variants"));
  else ["simpler", "structured", "technical"].forEach((level) => {
    const variant = value.variants[level];
    if (!isRecord(variant)) return issues.push(issue(`variants.${level}`, "must be an object"));
    if (!isString(variant.summary, { min: 1 })) issues.push(issue(`variants.${level}.summary`, "must be a non-empty string"));
    if (!Array.isArray(variant.sections) || variant.sections.length === 0) issues.push(issue(`variants.${level}.sections`, "must contain at least one section"));
    else variant.sections.forEach((section, index) => {
      if (!isRecord(section) || !isString(section.kind, { min: 1 })) issues.push(issue(`variants.${level}.sections[${index}]`, "must have a kind"));
      else if (!isExplainSectionKind(section.kind)) issues.push(issue(`variants.${level}.sections[${index}].kind`, "is not a supported explanation section"));
      if (!isString(section?.text) && !isString(section?.latex)) issues.push(issue(`variants.${level}.sections[${index}]`, "must have text or latex"));
      if (section?.kind === "equation" && !isString(section.latex, { min: 1 })) issues.push(issue(`variants.${level}.sections[${index}].latex`, "must contain KaTeX-compatible LaTeX for an equation"));
      if (section?.spokenText !== undefined && !isString(section.spokenText)) issues.push(issue(`variants.${level}.sections[${index}].spokenText`, "must be a string"));
    });
    if (variant.checkQuestion !== undefined && !isString(variant.checkQuestion, { min: 1 })) issues.push(issue(`variants.${level}.checkQuestion`, "must be a non-empty string when provided"));
    if (variant.spokenText !== undefined && !isString(variant.spokenText, { min: 1 })) issues.push(issue(`variants.${level}.spokenText`, "must be a non-empty string when provided"));
  });
  if (value.visualSuggestion !== null && value.visualSuggestion !== undefined && !isString(value.visualSuggestion)) issues.push(issue("visualSuggestion", "must be a string or null"));
  return result(value, issues);
}

export function validateGuideSession(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  for (const key of ["id", "goal"]) if (!isString(value[key], { min: 1 })) issues.push(issue(key, "must be a non-empty string"));
  if (!isStringArray(value.known || [])) issues.push(issue("known", "must be an array of strings"));
  if (!Number.isInteger(value.currentStep) || value.currentStep < 0) issues.push(issue("currentStep", "must be a non-negative integer"));
  if (!Array.isArray(value.completedSteps) || !value.completedSteps.every(Number.isInteger)) issues.push(issue("completedSteps", "must be integer array"));
  if (!isStringArray(value.misconceptions || [])) issues.push(issue("misconceptions", "must be an array of strings"));
  if (!Number.isInteger(value.hintLevel) || value.hintLevel < 0) issues.push(issue("hintLevel", "must be a non-negative integer"));
  return result(value, issues);
}

export function validateGuideMessage(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  for (const key of ["feedback", "nextQuestion"]) if (!isString(value[key], { min: 1 })) issues.push(issue(key, "must be a non-empty string"));
  if (value.hint !== null && value.hint !== undefined && !isString(value.hint)) issues.push(issue("hint", "must be a string or null"));
  if (!Number.isFinite(value.progress) || value.progress < 0 || value.progress > 1) issues.push(issue("progress", "must be between 0 and 1"));
  if (typeof value.isComplete !== "boolean") issues.push(issue("isComplete", "must be a boolean"));
  return result(value, issues);
}

export function validateGuideSessionRequest(value) {
  const issues = [];
  if (!isRecord(value)) return result(value, [issue("body", "must be an object")]);
  if (!isString(value.prompt?.trim(), { min: 1, max: 2000 })) issues.push(issue("prompt", "must be 1–2,000 characters"));
  if (value.learnerLevel !== undefined && !["simpler", "current", "technical"].includes(value.learnerLevel)) issues.push(issue("learnerLevel", "must be simpler, current, or technical"));
  return result({ prompt: value.prompt?.trim(), learnerLevel: value.learnerLevel || "current" }, issues);
}

export function validateGuideMessageRequest(value) {
  const issues = [];
  if (!isRecord(value)) return result(value, [issue("body", "must be an object")]);
  if (value.answer !== undefined && !isString(value.answer, { max: 2000 })) issues.push(issue("answer", "must be under 2,000 characters"));
  if (value.action !== undefined && !["answer", "hint", "explain", "skip", "visual"].includes(value.action)) issues.push(issue("action", "is not recognised"));
  if ((value.action || "answer") === "answer" && !isString(value.answer?.trim(), { min: 1, max: 2000 })) issues.push(issue("answer", "must be a non-empty response"));
  return result({ answer: value.answer?.trim() || "", action: value.action || "answer" }, issues);
}

export function validateVisualizationRequest(value) {
  const issues = [];
  if (!isRecord(value)) return result(value, [issue("body", "must be an object")]);
  if (!isString(value.prompt?.trim(), { min: 1, max: 2000 })) issues.push(issue("prompt", "must be 1–2,000 characters"));
  if (value.preferTemplate !== undefined && typeof value.preferTemplate !== "boolean") issues.push(issue("preferTemplate", "must be a boolean"));
  return result({ prompt: value.prompt?.trim(), preferTemplate: value.preferTemplate === true }, issues);
}

export function validateVisualizationParametersRequest(value) {
  const issues = [];
  if (!isRecord(value) || !isRecord(value.parameters)) return result(value, [issue("parameters", "must be an object")]);
  const entries = Object.entries(value.parameters);
  if (entries.length < 1 || entries.length > 32) issues.push(issue("parameters", "must contain 1–32 values"));
  for (const [key, parameter] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key)) issues.push(issue(`parameters.${key}`, "has an invalid name"));
    if (!Number.isFinite(parameter) || Math.abs(parameter) > 1000000) issues.push(issue(`parameters.${key}`, "must be a finite value between -1,000,000 and 1,000,000"));
  }
  return result({ parameters: Object.fromEntries(entries) }, issues);
}

export function validateVisualizationExportRequest(value) {
  const issues = [];
  if (!isRecord(value)) return result(value, [issue("body", "must be an object")]);
  if (!isRecord(value.options) || value.options.preset !== "preview" || Object.keys(value.options).length !== 1) issues.push(issue("options", "must request the preview export preset"));
  return result({ options: { preset: "preview" } }, issues);
}

export function validateVisualizationJob(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (!isString(value.id, { min: 1 })) issues.push(issue("id", "must be a non-empty string"));
  if (value.prompt !== undefined && !isString(value.prompt, { max: 2000 })) issues.push(issue("prompt", "must be a string under 2,000 characters"));
  if (!JOB_STATUSES.includes(value.status)) issues.push(issue("status", "is not recognised"));
  if (!isString(value.stage, { min: 1 })) issues.push(issue("stage", "must be a non-empty string"));
  if (!isString(value.createdAt, { min: 1 })) issues.push(issue("createdAt", "must be an ISO timestamp"));
  if (value.queuePosition !== null && value.queuePosition !== undefined && (!Number.isInteger(value.queuePosition) || value.queuePosition < 1)) issues.push(issue("queuePosition", "must be a positive integer or null"));
  if (value.error !== null && value.error !== undefined && (!isRecord(value.error) || !isString(value.error.code, { min: 1 }) || !isString(value.error.message, { min: 1 }))) issues.push(issue("error", "must be a safe error object or null"));
  return result(value, issues);
}

export function validateVisualizationEvent(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (!isString(value.jobId, { min: 1 })) issues.push(issue("jobId", "must be a non-empty string"));
  if (!VISUALIZATION_STAGES.includes(value.stage)) issues.push(issue("stage", "is not recognised"));
  if (!isString(value.at, { min: 1 })) issues.push(issue("at", "must be an ISO timestamp"));
  return result(value, issues);
}

export function validateSceneSpec(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (!isString(value.id, { min: 1 })) issues.push(issue("id", "must be a non-empty string"));
  if (!Array.isArray(value.entities)) issues.push(issue("entities", "must be an array"));
  if (!isRecord(value.world)) issues.push(issue("world", "must be an object"));
  return result(value, issues);
}

export function validateTimeline(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (!isString(value.sceneId, { min: 1 })) issues.push(issue("sceneId", "must be a non-empty string"));
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0) issues.push(issue("durationMs", "must be a non-negative number"));
  if (!Array.isArray(value.frames)) issues.push(issue("frames", "must be an array"));
  return result(value, issues);
}

export function requireValid(validation, message = "The request does not match the Velo contract.") {
  if (!validation.ok) throw new VeloError("CONTRACT_MISMATCH", message, { status: 422 });
  return validation.value;
}
