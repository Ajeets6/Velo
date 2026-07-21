import { VeloError } from "./errors.mjs";
import { getProvider } from "./provider-registry.mjs";

function text(value, name, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new VeloError("INVALID_REQUEST", `${name} is required.`);
    return "";
  }
  if (typeof value !== "string" || value.trim().length > 200) {
    throw new VeloError("INVALID_REQUEST", `${name} must be a short string.`);
  }
  return value.trim();
}

function defaultTutorSelection(config) {
  return {
    provider: config.provider,
    model: config.provider === "local" ? "" : config.provider === "ollama" ? config.ollamaModel : config.providerModel,
  };
}

function defaultMotionForgeSelection(config) {
  return {
    provider: config.motionForgeProvider || "ollama",
    model: config.motionForgeModel || "",
  };
}

function resolve(input, fallback, capability) {
  const provider = text(input?.provider, "provider") || fallback.provider;
  const model = text(input?.model, "model") || fallback.model;
  const definition = getProvider(provider);
  if (!definition || !definition[capability]) {
    throw new VeloError("INVALID_REQUEST", "The selected provider is not available for this mode.");
  }
  if (definition.modelInput && !model) {
    throw new VeloError("INVALID_REQUEST", "Choose a model for the selected provider.");
  }
  if (!definition.modelInput && model) {
    throw new VeloError("INVALID_REQUEST", "The selected provider does not use a model name.");
  }
  return { provider, model };
}

export function resolveTutorSelection(input, config) {
  return resolve(input, defaultTutorSelection(config), "supportsBaseTutor");
}

export function resolveMotionForgeSelection(input, config) {
  return resolve(input, defaultMotionForgeSelection(config), "supportsMotionForge");
}
