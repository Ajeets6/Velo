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

async function captureResponse(capture, response) {
  if (!capture) return;
  const body = response.clone ? await response.clone().text() : null;
  await capture.complete({ status: response.status ?? null, body });
}

export function createOllamaProvider({ baseUrl, model, timeoutMs, fetchImpl = fetch, payloadStore = null }) {
  const request = async (pathname, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const capture = await payloadStore?.begin({ provider: "ollama", model, method: options.method || "GET", url: `${baseUrl}${pathname}`, body: options.body ?? null });
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, { ...options, signal: controller.signal });
      await captureResponse(capture, response);
      if (!response.ok) throw new VeloError("MODEL_UNAVAILABLE", "The configured model provider is unavailable.", { status: 503 });
      return response;
    } catch (error) {
      if (!(error instanceof VeloError)) await capture?.complete({ error: { code: error.name || "NETWORK_ERROR", message: error.message || "The request failed." } });
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

function cloudRequest({ baseUrl, headers, apiKey, label, provider, model, payloadStore, timeoutMs, fetchImpl, unavailableMessage }) {
  return async (pathname, options = {}) => {
    if (!apiKey) throw new VeloError("MODEL_UNAVAILABLE", `Save an API key for ${label} before using it.`, { status: 401 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const capture = await payloadStore?.begin({ provider, model, method: options.method || "GET", url: `${baseUrl}${pathname}`, body: options.body ?? null });
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: controller.signal });
      await captureResponse(capture, response);
      if (!response.ok) throw new VeloError("MODEL_UNAVAILABLE", unavailableMessage, { status: response.status });
      return response;
    } catch (error) {
      if (!(error instanceof VeloError)) await capture?.complete({ error: { code: error.name || "NETWORK_ERROR", message: error.message || "The request failed." } });
      if (error.name === "AbortError") throw new VeloError("TIMEOUT", "The model provider did not respond in time.");
      if (error instanceof VeloError) throw error;
      throw new VeloError("MODEL_UNAVAILABLE", unavailableMessage, { cause: error, status: 503 });
    } finally { clearTimeout(timer); }
  };
}

function optionalApiKey(apiKey) { return typeof apiKey === "string" ? apiKey.trim() : ""; }

function textFromOpenAI(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const text = (data.output || []).flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (typeof text !== "string" || !text.trim()) throw new VeloError("CONTRACT_MISMATCH", "OpenAI returned an invalid response.", { status: 502 });
  return text;
}

export function createOpenAIProvider({ apiKey, model, timeoutMs, fetchImpl = fetch, payloadStore = null }) {
  const key = optionalApiKey(apiKey);
  const request = cloudRequest({ baseUrl: "https://api.openai.com", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, apiKey: key, label: "OpenAI", provider: "openai", model, payloadStore, timeoutMs, fetchImpl, unavailableMessage: "OpenAI could not complete that request." });
  const generate = async ({ prompt, mode = "explain", structured = false }) => {
    const instructions = structured ? "Return only valid JSON for the requested schema." : `You are Velo, an encouraging physics tutor. Mode: ${mode}. Use plain language and correct SI units.`;
    const response = await request("/v1/responses", { method: "POST", body: JSON.stringify({ model, instructions, input: prompt }) });
    return textFromOpenAI(await response.json());
  };
  return {
    name: "openai",
    async health() { await request(`/v1/models/${encodeURIComponent(model)}`); return { ok: true, provider: "openai", structuredOutput: true }; },
    async listModels() { const data = await (await request("/v1/models")).json(); return (data.data || []).map((item) => item.id).filter(Boolean); },
    async generateText({ prompt, mode }) { const answer = await generate({ prompt, mode }); return { title: "Velo's explanation", answer, nextStep: "Ask a follow-up or explore it another way." }; },
    async generateStructured({ prompt, schema, mode }) { const answer = await generate({ prompt: `Schema: ${JSON.stringify(schema)}\n\n${prompt}`, mode, structured: true }); try { return JSON.parse(answer); } catch { throw new VeloError("CONTRACT_MISMATCH", "OpenAI did not return valid JSON.", { status: 502 }); } },
    async cancel() { return false; },
  };
}

function textFromAnthropic(data) {
  const text = (data.content || []).find((item) => item.type === "text")?.text;
  if (typeof text !== "string" || !text.trim()) throw new VeloError("CONTRACT_MISMATCH", "Anthropic returned an invalid response.", { status: 502 });
  return text;
}

export function createAnthropicProvider({ apiKey, model, timeoutMs, fetchImpl = fetch, payloadStore = null }) {
  const key = optionalApiKey(apiKey);
  const request = cloudRequest({ baseUrl: "https://api.anthropic.com", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, apiKey: key, label: "Anthropic", provider: "anthropic", model, payloadStore, timeoutMs, fetchImpl, unavailableMessage: "Anthropic could not complete that request." });
  const generate = async ({ prompt, mode = "explain", structured = false }) => {
    const system = structured ? "Return only valid JSON for the requested schema." : `You are Velo, an encouraging physics tutor. Mode: ${mode}. Use plain language and correct SI units.`;
    const response = await request("/v1/messages", { method: "POST", body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content: prompt }] }) });
    return textFromAnthropic(await response.json());
  };
  return {
    name: "anthropic",
    async health() { await generate({ prompt: "Reply exactly: OK", mode: "health" }); return { ok: true, provider: "anthropic", structuredOutput: true }; },
    async listModels() { return []; },
    async generateText({ prompt, mode }) { const answer = await generate({ prompt, mode }); return { title: "Velo's explanation", answer, nextStep: "Ask a follow-up or explore it another way." }; },
    async generateStructured({ prompt, schema, mode }) { const answer = await generate({ prompt: `Schema: ${JSON.stringify(schema)}\n\n${prompt}`, mode, structured: true }); try { return JSON.parse(answer); } catch { throw new VeloError("CONTRACT_MISMATCH", "Anthropic did not return valid JSON.", { status: 502 }); } },
    async cancel() { return false; },
  };
}

export function createProvider(config, dependencies = {}) {
  const model = config.model || config.ollamaModel;
  if (config.provider === "ollama") return createOllamaProvider({ baseUrl: config.ollamaBaseUrl, model, timeoutMs: config.ollamaTimeoutMs, ...dependencies });
  if (config.provider === "openai") return createOpenAIProvider({ apiKey: config.apiKey, model, timeoutMs: config.ollamaTimeoutMs, ...dependencies });
  if (config.provider === "anthropic") return createAnthropicProvider({ apiKey: config.apiKey, model, timeoutMs: config.ollamaTimeoutMs, ...dependencies });
  return createLocalProvider();
}
