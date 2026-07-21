import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION, EXPLAIN_SECTION_KINDS, validateExplainResponse } from "./contracts.mjs";
import { ensurePrivateDataDirectory } from "./private-data.mjs";

const concepts = [
  { words: ["orbit", "satellite"], title: "Why satellites stay in orbit", topic: "orbits", visualSuggestion: "orbit", intuition: "A satellite is always falling toward Earth, but it is also moving sideways fast enough to keep missing the ground.", equation: "v²/r = GM/r²", spokenEquation: "speed squared divided by radius equals gravitational constant times mass divided by radius squared", definition: "The radius is the distance from Earth’s centre; v is orbital speed; G and M describe Earth’s gravity.", example: "Lower orbits need more sideways speed because the curve is tighter." },
  { words: ["force", "newton", "acceleration"], title: "Forces change motion", topic: "forces", visualSuggestion: "force", intuition: "A force is a push or pull. Only the unbalanced, or net, force changes an object’s velocity.", equation: "F = ma", spokenEquation: "force equals mass times acceleration", definition: "F is net force in newtons, m is mass in kilograms, and a is acceleration in metres per second squared.", example: "A 2 kilogram cart accelerating at 3 metres per second squared needs 6 newtons of net force." },
  { words: ["energy", "kinetic", "potential"], title: "Energy changes form", topic: "energy", visualSuggestion: "graph", intuition: "Energy is a useful accounting system: it can move between forms while the total stays constant in an isolated system.", equation: "Eₖ = ½mv²", spokenEquation: "kinetic energy equals one half mass times speed squared", definition: "Kinetic energy is motion energy, measured in joules. Mass is in kilograms and speed is in metres per second.", example: "As a dropped ball speeds up, gravitational potential energy becomes kinetic energy." },
];

const explainSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "mode", "title", "summary", "sections", "checkQuestion", "spokenText", "variants"],
  properties: {
    contractVersion: { const: CONTRACT_VERSION },
    mode: { const: "explain" },
    title: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } },
    checkQuestion: { type: "string", minLength: 1 },
    spokenText: { type: "string", minLength: 1 },
    visualSuggestion: { type: ["string", "null"] },
    variants: {
      type: "object",
      additionalProperties: false,
      required: ["simpler", "structured", "technical"],
      properties: {
        simpler: { $ref: "#/$defs/variant" },
        structured: { $ref: "#/$defs/variant" },
        technical: { $ref: "#/$defs/variant" },
      },
    },
  },
  $defs: {
    section: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: EXPLAIN_SECTION_KINDS },
        text: { type: "string", minLength: 1 },
        latex: { type: "string", minLength: 1 },
        spokenText: { type: "string", minLength: 1 },
      },
      anyOf: [{ required: ["text"] }, { required: ["latex"] }],
      allOf: [{
        if: { properties: { kind: { const: "equation" } }, required: ["kind"] },
        then: { required: ["latex"] },
      }],
    },
    variant: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "sections", "spokenText"],
      properties: {
        summary: { type: "string", minLength: 1 },
        sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } },
        checkQuestion: { type: "string", minLength: 1 },
        spokenText: { type: "string", minLength: 1 },
      },
    },
  },
};

const explainVariantSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sections"],
  properties: {
    title: { type: "string", minLength: 1 }, summary: { type: "string", minLength: 1 }, sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } }, checkQuestion: { type: "string", minLength: 1 }, spokenText: { type: "string", minLength: 1 },
  },
  $defs: explainSchema.$defs,
};

const sectionKindsByVariant = {
  simpler: ["intuition", "example", "equation"],
  structured: ["intuition", "detail", "equation", "example", "assumptions", "recap"],
  technical: ["definition", "assumptions", "equation", "derivation", "units", "limitations", "example"],
};

const equationFormattingInstruction = "Math formatting: Velo renders formulas with KaTeX. Put every standalone formula in a section whose kind is equation and whose latex value is raw, KaTeX-compatible LaTeX—for example, \\vec{v} = \\frac{d\\vec{r}}{dt}. Do not wrap that latex value in $, $$, \\(...\\), or \\[...\\]. Do not put unmarked formulas in text. If math must appear inside a sentence, wrap it with \\(...\\) for inline math or \\[...\\] for display math.";
const textFormattingInstruction = "Text formatting: Velo safely supports **bold**, *italic*, inline code marked with one backtick on each side, and simple Markdown lists that start with - or 1. Use those only when they improve clarity. Do not use HTML, Markdown tables, or Markdown headings because the section labels are the headings.";

function unwrapMathDelimiters(latex) {
  const value = typeof latex === "string" ? latex.trim() : "";
  if (value.startsWith("$$") && value.endsWith("$$")) return value.slice(2, -2).trim();
  if (value.startsWith("\\[") && value.endsWith("\\]")) return value.slice(2, -2).trim();
  if (value.startsWith("\\(") && value.endsWith("\\)")) return value.slice(2, -2).trim();
  return value;
}

function normalizeEquationLatex(candidate) {
  if (!candidate || !Array.isArray(candidate.sections)) return candidate;
  return {
    ...candidate,
    sections: candidate.sections.map((section) => (
      section?.kind === "equation" && typeof section.latex === "string"
        ? { ...section, latex: unwrapMathDelimiters(section.latex) }
        : section
    )),
  };
}

function schemaForVariant(sectionKinds, { requireTitle = false } = {}) {
  return {
    ...explainVariantSchema,
    required: requireTitle
      ? [...explainVariantSchema.required, "title"]
      : explainVariantSchema.required,
    $defs: {
      ...explainVariantSchema.$defs,
      section: {
        ...explainVariantSchema.$defs.section,
        properties: {
          ...explainVariantSchema.$defs.section.properties,
          kind: { type: "string", enum: sectionKinds },
        },
      },
    },
  };
}

function nonEmptyText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function spokenTextForSections(sections) {
  if (!Array.isArray(sections)) return "";
  return sections
    .map((section) => (
      nonEmptyText(section?.spokenText) ||
      nonEmptyText(section?.text) ||
      nonEmptyText(section?.latex)
    ))
    .filter(Boolean)
    .join(" ");
}

function normalizeModelVariant(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return candidate;
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section))
        return section;
      const normalized = { ...section };
      for (const field of ["text", "latex", "spokenText"]) {
        if (typeof normalized[field] !== "string") continue;
        const value = normalized[field].trim();
        if (value) normalized[field] = value;
        else delete normalized[field];
      }
      if (typeof normalized.kind === "string")
        normalized.kind = normalized.kind.trim().toLowerCase();
      return normalized;
    })
    : candidate.sections;
  const normalized = { ...candidate, sections };
  for (const field of ["title", "summary", "checkQuestion", "spokenText"]) {
    if (typeof normalized[field] !== "string") continue;
    const value = normalized[field].trim();
    if (value) normalized[field] = value;
    else delete normalized[field];
  }
  if (!normalized.spokenText)
    normalized.spokenText = spokenTextForSections(sections);
  return normalizeEquationLatex(normalized);
}

function chooseConcept(prompt) { const normal = prompt.toLowerCase(); return concepts.find((item) => item.words.some((word) => normal.includes(word))) || { title: "Let’s build a physics model", topic: "physics modelling", visualSuggestion: null, intuition: "Start by defining the system, what changes, and the quantity you want to find.", equation: "known values → principle → result", spokenEquation: "known values, then a physics principle, then a checked result", definition: "A useful model states assumptions and checks units and direction.", example: "For a moving object, list forces first, then decide which equation connects them to the unknown." }; }

function localExplain(prompt, learnerLevel, context) {
  const concept = chooseConcept(prompt);
  const detail = learnerLevel === "simpler" ? "We will keep the idea intuitive first and add only the essential vocabulary." : learnerLevel === "technical" ? "We will state the model assumptions, units, and the equation’s meaning precisely." : "Next, connect the intuition to a compact equation and one concrete example.";
  const sections = [
    { kind: "intuition", text: concept.intuition, spokenText: concept.intuition },
    { kind: "detail", text: detail, spokenText: detail },
    { kind: "equation", latex: concept.equation, text: concept.definition, spokenText: concept.spokenEquation },
    { kind: "example", text: concept.example, spokenText: concept.example },
    { kind: "recap", text: `The key idea is ${concept.topic}. ${context.topic && context.topic !== concept.topic ? `This connects to your earlier topic, ${context.topic}.` : ""}`, spokenText: `The key idea is ${concept.topic}.` },
  ];
  return { contractVersion: CONTRACT_VERSION, mode: "explain", title: concept.title, summary: concept.intuition, sections, checkQuestion: "Which part would you like to check next: the intuition, the equation, or the example?", visualSuggestion: concept.visualSuggestion, spokenText: sections.map((section) => section.spokenText).join(" "), topic: concept.topic };
}

function localExplainVariants(prompt, context) {
  const concept = chooseConcept(prompt);
  const structuredSections = [
    { kind: "intuition", text: concept.intuition, spokenText: concept.intuition },
    { kind: "detail", text: "Connect the intuition to the governing physics principle, then test it with a concrete example.", spokenText: "Connect the intuition to the governing physics principle, then test it with a concrete example." },
    { kind: "equation", latex: concept.equation, text: concept.definition, spokenText: concept.spokenEquation },
    { kind: "example", text: concept.example, spokenText: concept.example },
    { kind: "recap", text: `The key idea is ${concept.topic}. ${context.topic && context.topic !== concept.topic ? `This connects to your earlier topic, ${context.topic}.` : ""}`, spokenText: `The key idea is ${concept.topic}.` },
  ];
  const simplerSections = [
    { kind: "intuition", text: concept.intuition, spokenText: concept.intuition },
    { kind: "example", text: concept.example, spokenText: concept.example },
  ];
  const technicalSections = [
    { kind: "definition", text: concept.definition, spokenText: concept.definition },
    { kind: "assumptions", text: "Define the system, use consistent SI units, and verify that the model assumptions match the situation before applying the equation.", spokenText: "Define the system, use consistent SI units, and verify that the model assumptions match the situation before applying the equation." },
    { kind: "equation", latex: concept.equation, text: concept.definition, spokenText: concept.spokenEquation },
    { kind: "example", text: concept.example, spokenText: concept.example },
  ];
  const variant = (summary, sections, checkQuestion) => ({ summary, sections, ...(checkQuestion ? { checkQuestion } : {}), spokenText: sections.map((section) => section.spokenText || section.text || section.latex).join(" ") });
  const variants = {
    simpler: variant(concept.intuition, simplerSections),
    structured: variant(concept.intuition, structuredSections, "Which part would you like to check next: the intuition, the equation, or the example?"),
    technical: variant(concept.definition, technicalSections),
  };
  return { contractVersion: CONTRACT_VERSION, mode: "explain", title: concept.title, summary: variants.structured.summary, sections: structuredSections, checkQuestion: variants.structured.checkQuestion, visualSuggestion: concept.visualSuggestion, spokenText: variants.structured.spokenText, variants, topic: concept.topic };
}

export class ExplainService {
  constructor(config, { provider, log = () => {} } = {}) {
    ensurePrivateDataDirectory(config.dataDir);
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.provider = provider;
    this.log = log;
    this.db.exec("CREATE TABLE IF NOT EXISTS explain_sessions (id TEXT PRIMARY KEY, learner_level TEXT NOT NULL, topic TEXT, terminology TEXT NOT NULL, recent_prompts TEXT NOT NULL, updated_at TEXT NOT NULL)");
    this.cleanup(config.dataRetentionDays ?? 30);
  }
  close() { this.db.close(); }
  context(id) {
    const row = this.db.prepare("SELECT * FROM explain_sessions WHERE id = ?").get(id);
    return row ? { topic: row.topic, terminology: JSON.parse(row.terminology), recentPrompts: JSON.parse(row.recent_prompts) } : { topic: null, terminology: [], recentPrompts: [] };
  }
  save(id, learnerLevel, response, prompt, context) {
    const terms = [...new Set([...context.terminology, response.topic].filter(Boolean))].slice(-12);
    const prompts = [...context.recentPrompts, prompt].slice(-6);
    this.db.prepare("INSERT INTO explain_sessions(id, learner_level, topic, terminology, recent_prompts, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET learner_level=excluded.learner_level, topic=excluded.topic, terminology=excluded.terminology, recent_prompts=excluded.recent_prompts, updated_at=excluded.updated_at").run(id, learnerLevel, response.topic, JSON.stringify(terms), JSON.stringify(prompts), new Date().toISOString());
  }
  async create({ prompt, sessionId, learnerLevel }, { provider = this.provider } = {}) {
    const id = sessionId || randomUUID(); const context = this.context(id);
    let response = localExplainVariants(prompt, context);
    if (provider?.name !== "local" && provider?.generateStructured) {
      const instructions = {
        simpler: "Write a simple, plain-language explanation. Tag each section as intuition, example, or equation. Use only relevant intuition and at most one everyday example. Avoid equations unless essential. Do not include a title.",
        structured: "Write a guided explanation with a concise title. Tag each section as intuition, detail, equation, example, assumptions, or recap. Use only the relevant sections and include checkQuestion only when useful.",
        technical: "Write an in-depth explanation. Tag each section as definition, assumptions, equation, derivation, units, limitations, or example. Use only the relevant sections and precise terminology. Do not include a title.",
      };
      const valid = (candidate, level) => Boolean(
        candidate &&
        (level !== "structured" || nonEmptyText(candidate.title)) &&
        nonEmptyText(candidate.summary) &&
        nonEmptyText(candidate.spokenText) &&
        Array.isArray(candidate.sections) &&
        candidate.sections.length > 0 &&
        candidate.sections.every((section) =>
          sectionKindsByVariant[level].includes(section?.kind) &&
          (nonEmptyText(section.text) || nonEmptyText(section.latex)) &&
          (section.kind !== "equation" || nonEmptyText(section.latex)),
        ),
      );
      const candidates = await Promise.all(Object.entries(instructions).map(async ([level, instruction]) => {
        try {
          const candidate = await provider.generateStructured({ prompt: `${instruction}\n\n${equationFormattingInstruction}\n\n${textFormattingInstruction}\n\nThe server adds contractVersion, mode, variants, and visualSuggestion. Do not include those fields. Omit any field or tagged section that is not useful; never send empty strings or placeholders.\n\nQuestion: ${prompt}\nPrior topic: ${context.topic || "none"}. Return only this one explanation.`, mode: "explain", schema: schemaForVariant(sectionKindsByVariant[level], { requireTitle: level === "structured" }) });
          return [level, normalizeModelVariant(candidate)];
        } catch {
          this.log("warn", "explain_variant_fallback", { sessionId: id, level });
          return [level, null];
        }
      }));
      const modelVariants = Object.fromEntries(candidates);
      const fallback = response;
      const asVariant = (level) => valid(modelVariants[level], level) ? { summary: modelVariants[level].summary, sections: modelVariants[level].sections, ...(modelVariants[level].checkQuestion ? { checkQuestion: modelVariants[level].checkQuestion } : {}), spokenText: modelVariants[level].spokenText } : fallback.variants[level];
      const structured = valid(modelVariants.structured, "structured") ? modelVariants.structured : null;
      const merged = { contractVersion: CONTRACT_VERSION, mode: "explain", title: structured?.title || fallback.title, summary: structured?.summary || fallback.summary, sections: structured?.sections || fallback.sections, checkQuestion: structured?.checkQuestion || fallback.checkQuestion, spokenText: structured?.spokenText || fallback.spokenText, visualSuggestion: structured?.visualSuggestion ?? fallback.visualSuggestion, variants: { simpler: asVariant("simpler"), structured: asVariant("structured"), technical: asVariant("technical") }, topic: chooseConcept(prompt).topic };
      if (validateExplainResponse(merged).ok) response = merged;
    }
    this.save(id, learnerLevel, response, prompt, context);
    return { sessionId: id, response };
  }
  cleanup(retentionDays) { this.db.prepare("DELETE FROM explain_sessions WHERE updated_at < ?").run(new Date(Date.now() - retentionDays * 86400000).toISOString()); }
}
