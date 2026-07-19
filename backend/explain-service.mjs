import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { CONTRACT_VERSION, validateExplainResponse } from "./contracts.mjs";

const concepts = [
  { words: ["orbit", "satellite"], title: "Why satellites stay in orbit", topic: "orbits", visualSuggestion: "orbit", intuition: "A satellite is always falling toward Earth, but it is also moving sideways fast enough to keep missing the ground.", equation: "v²/r = GM/r²", spokenEquation: "speed squared divided by radius equals gravitational constant times mass divided by radius squared", definition: "The radius is the distance from Earth’s centre; v is orbital speed; G and M describe Earth’s gravity.", example: "Lower orbits need more sideways speed because the curve is tighter." },
  { words: ["force", "newton", "acceleration"], title: "Forces change motion", topic: "forces", visualSuggestion: "force", intuition: "A force is a push or pull. Only the unbalanced, or net, force changes an object’s velocity.", equation: "F = ma", spokenEquation: "force equals mass times acceleration", definition: "F is net force in newtons, m is mass in kilograms, and a is acceleration in metres per second squared.", example: "A 2 kilogram cart accelerating at 3 metres per second squared needs 6 newtons of net force." },
  { words: ["energy", "kinetic", "potential"], title: "Energy changes form", topic: "energy", visualSuggestion: "graph", intuition: "Energy is a useful accounting system: it can move between forms while the total stays constant in an isolated system.", equation: "Eₖ = ½mv²", spokenEquation: "kinetic energy equals one half mass times speed squared", definition: "Kinetic energy is motion energy, measured in joules. Mass is in kilograms and speed is in metres per second.", example: "As a dropped ball speeds up, gravitational potential energy becomes kinetic energy." },
];

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

export class ExplainService {
  constructor(config, { provider, log = () => {} } = {}) {
    mkdirSync(config.dataDir, { recursive: true });
    this.db = new DatabaseSync(config.databasePath);
    this.provider = provider;
    this.log = log;
    this.db.exec("CREATE TABLE IF NOT EXISTS explain_sessions (id TEXT PRIMARY KEY, learner_level TEXT NOT NULL, topic TEXT, terminology TEXT NOT NULL, recent_prompts TEXT NOT NULL, updated_at TEXT NOT NULL)");
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
  async create({ prompt, sessionId, learnerLevel }) {
    const id = sessionId || randomUUID(); const context = this.context(id);
    let response = localExplain(prompt, learnerLevel, context);
    if (this.provider?.name === "ollama") {
      try {
        const candidate = await this.provider.generateStructured({ prompt: `Learner level: ${learnerLevel}. Prior topic: ${context.topic || "none"}. ${prompt}`, mode: "explain", schema: { type: "object", required: ["contractVersion", "mode", "title", "summary", "sections", "checkQuestion", "spokenText"] } });
        if (validateExplainResponse(candidate).ok) response = { ...candidate, topic: chooseConcept(prompt).topic };
      } catch { this.log("warn", "explain_fallback", { sessionId: id }); }
    }
    this.save(id, learnerLevel, response, prompt, context);
    return { sessionId: id, response };
  }
}
