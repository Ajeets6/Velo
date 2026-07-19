import { VeloError } from "./errors.mjs";

function localAnswer(prompt, mode) {
  return { title: mode === "guide" ? "Let’s reason it through" : "Let’s model it", answer: `Physics becomes manageable when we define the system and choose a useful principle. For “${prompt}”, start by identifying the objects, known values, and what changes.`, nextStep: "What quantity are you trying to find?" };
}

export function createLocalProvider() {
  return {
    name: "local",
    async health() { return { ok: true, provider: "local", structuredOutput: false }; },
    async listModels() { return []; },
    async generateText({ prompt, mode = "explain" }) { return localAnswer(prompt, mode); },
    async generateStructured() { throw new VeloError("CONTRACT_MISMATCH", "The local fallback does not generate structured model output.", { status: 501 }); },
    async cancel() { return false; },
  };
}

export function createOllamaProvider({ baseUrl, model, timeoutMs, fetchImpl = fetch }) {
  const request = async (pathname, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, { ...options, signal: controller.signal });
      if (!response.ok) throw new VeloError("MODEL_UNAVAILABLE", "The configured model provider is unavailable.", { status: 503 });
      return response;
    } catch (error) {
      if (error.name === "AbortError") throw new VeloError("TIMEOUT", "The model provider did not respond in time.");
      if (error instanceof VeloError) throw error;
      throw new VeloError("MODEL_UNAVAILABLE", "The configured model provider is unavailable.", { cause: error, status: 503 });
    } finally { clearTimeout(timer); }
  };
  return {
    name: "ollama",
    async health() { await request("/api/tags"); return { ok: true, provider: "ollama", structuredOutput: true }; },
    async listModels() { const data = await (await request("/api/tags")).json(); return (data.models || []).map((item) => item.name).filter(Boolean); },
    async generateText({ prompt, mode = "explain" }) {
      const response = await request("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: `You are Velo, an encouraging physics tutor. Mode: ${mode}. Use plain language and correct SI units.` }, { role: "user", content: prompt }] }) });
      const data = await response.json();
      const answer = data.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new VeloError("CONTRACT_MISMATCH", "The model returned an invalid response.", { status: 502 });
      return { title: "Velo’s explanation", answer, nextStep: "Ask a follow-up or switch modes to explore it another way." };
    },
    async generateStructured({ prompt, schema, mode = "explain" }) {
      const response = await request("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: `Return only JSON matching this schema: ${JSON.stringify(schema)}. Mode: ${mode}.` }, { role: "user", content: prompt }] }) });
      const data = await response.json();
      try { return JSON.parse(data.message?.content || ""); } catch { throw new VeloError("CONTRACT_MISMATCH", "The model did not return valid structured output.", { status: 502 }); }
    },
    async cancel() { return false; },
  };
}

export function createProvider(config, dependencies = {}) {
  return config.provider === "ollama" ? createOllamaProvider({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel, timeoutMs: config.ollamaTimeoutMs, ...dependencies }) : createLocalProvider();
}
