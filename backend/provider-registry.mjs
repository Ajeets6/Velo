const registry = [
  { id: "local", label: "Velo local", kind: "local", requiresApiKey: false, supportsBaseTutor: true, supportsMotionForge: false, modelInput: false },
  { id: "ollama", label: "Ollama", kind: "local", requiresApiKey: false, supportsBaseTutor: true, supportsMotionForge: true, modelInput: true },
  { id: "openai", label: "OpenAI", kind: "cloud", requiresApiKey: true, supportsBaseTutor: true, supportsMotionForge: false, modelInput: true },
  { id: "anthropic", label: "Anthropic", kind: "cloud", requiresApiKey: true, supportsBaseTutor: true, supportsMotionForge: true, modelInput: true },
];

export function listPublicProviders() { return registry.map(({ id, label, kind, requiresApiKey, supportsBaseTutor, supportsMotionForge, modelInput }) => ({ id, label, kind, requiresApiKey, supportsBaseTutor, supportsMotionForge, modelInput })); }
export function getProvider(id) { return registry.find((provider) => provider.id === id) || null; }
