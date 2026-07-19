import { VeloError } from "./errors.mjs";

export const CONTRACT_VERSION = 1;
export const LEARNING_MODES = Object.freeze(["explain", "guide", "visualize"]);
export const JOB_STATUSES = Object.freeze(["queued", "running", "complete", "failed", "cancelled"]);
export const VISUALIZATION_STAGES = Object.freeze(["queued", "compiling", "validating", "simulating", "ready", "exporting", "failed", "cancelled"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => typeof value === "string" && value.length >= min && value.length <= max;
const isStringArray = (value) => Array.isArray(value) && value.every((item) => isString(item));
const issue = (path, message) => ({ path, message });

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

export function validateExplainResponse(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (value.mode !== "explain") issues.push(issue("mode", "must be explain"));
  for (const key of ["title", "summary", "checkQuestion", "spokenText"]) if (!isString(value[key], { min: 1 })) issues.push(issue(key, "must be a non-empty string"));
  if (!Array.isArray(value.sections) || value.sections.length === 0) issues.push(issue("sections", "must contain at least one section"));
  else value.sections.forEach((section, index) => {
    if (!isRecord(section) || !isString(section.kind, { min: 1 })) issues.push(issue(`sections[${index}]`, "must have a kind"));
    if (!isString(section?.text) && !isString(section?.latex)) issues.push(issue(`sections[${index}]`, "must have text or latex"));
    if (section?.spokenText !== undefined && !isString(section.spokenText)) issues.push(issue(`sections[${index}].spokenText`, "must be a string"));
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

export function validateVisualizationJob(value) {
  const issues = !isRecord(value) ? [issue("body", "must be an object")] : versionIssues(value);
  if (!isRecord(value)) return result(value, issues);
  if (!isString(value.id, { min: 1 })) issues.push(issue("id", "must be a non-empty string"));
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
