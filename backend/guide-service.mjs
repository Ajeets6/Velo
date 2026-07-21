import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { VeloError } from "./errors.mjs";
import { ensurePrivateDataDirectory } from "./private-data.mjs";

const now = () => new Date().toISOString();
const steps = [
  { concept: "system", question: "What objects belong in the system, and what information is already known?", hint: "Name the object or objects, then list quantities with units.", keywords: ["object", "mass", "speed", "height", "force", "known"] },
  { concept: "principle", question: "Which physics principle connects the known information to the quantity you want to find?", hint: "Choose a principle such as Newton’s laws, conservation of energy, or momentum before choosing an equation.", keywords: ["newton", "energy", "momentum", "force", "conservation"] },
  { concept: "model", question: "What equation or relationship would you write, and what assumption makes it valid here?", hint: "State the relationship in words first, then check whether air resistance, friction, or another effect is being ignored.", keywords: ["equation", "equals", "f", "energy", "momentum", "assume"] },
  { concept: "check", question: "How would you check that your answer has sensible units, direction, and size?", hint: "Check units, sign/direction, and whether the result is physically reasonable.", keywords: ["unit", "direction", "reasonable", "check", "metre", "newton"] },
];

function feedbackFor(answer, step) {
  const lower = answer.toLowerCase();
  if (answer.length < 8) return { classification: "unrelated", feedback: "Give your best first thought in a short sentence; an imperfect answer is useful." };
  if (step.keywords.some((word) => lower.includes(word))) return { classification: "correct", feedback: "That identifies a useful part of this step." };
  if (answer.length > 20) return { classification: "partly_correct", feedback: "You are reasoning about the situation; now connect it more directly to this step’s physics idea." };
  return { classification: "misconception", feedback: "That does not yet connect to the principle we need. Let’s narrow the step down." };
}

export class GuideService {
  constructor(config, { log = () => {} } = {}) {
    ensurePrivateDataDirectory(config.dataDir); this.db = new DatabaseSync(config.databasePath); this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"); this.log = log;
    this.db.exec("CREATE TABLE IF NOT EXISTS guide_sessions (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, learner_level TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'local', model TEXT NOT NULL DEFAULT '', state TEXT NOT NULL, outline TEXT NOT NULL, history TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const columns = this.db.prepare("PRAGMA table_info(guide_sessions)").all().map((column) => column.name);
    if (!columns.includes("provider")) this.db.exec("ALTER TABLE guide_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'");
    if (!columns.includes("model")) this.db.exec("ALTER TABLE guide_sessions ADD COLUMN model TEXT NOT NULL DEFAULT ''");
    this.cleanup(config.dataRetentionDays ?? 30);
  }
  close() { this.db.close(); }
  row(id) { return this.db.prepare("SELECT * FROM guide_sessions WHERE id = ?").get(id); }
  publicSession(row, message = null) {
    if (!row) return null; const state = JSON.parse(row.state); const outline = JSON.parse(row.outline); const history = JSON.parse(row.history);
    return { contractVersion: 1, id: row.id, prompt: row.prompt, learnerLevel: row.learner_level, provider: row.provider, model: row.model, goal: state.goal, known: state.known, currentStep: state.currentStep, completedSteps: state.completedSteps, misconceptions: state.misconceptions, hintLevel: state.hintLevel, progress: state.completedSteps.length / outline.length, isComplete: state.isComplete, currentQuestion: state.isComplete ? state.transferQuestion : outline[state.currentStep].question, history, message };
  }
  get(id) { return this.publicSession(this.row(id)); }
  async create({ prompt, learnerLevel }, { provider = null, selection = { provider: "local", model: "" } } = {}) {
    const id = randomUUID(); const time = now(); const state = { goal: `Reason through: ${prompt}`, known: [], currentStep: 0, completedSteps: [], misconceptions: [], hintLevel: 0, isComplete: false, transferQuestion: "How would this method change if one important condition in the problem changed?" };
    if (provider?.name === "ollama") {
      try {
        const response = await provider.generateText({ prompt: `Write one concise learning goal for a guided physics lesson about: ${prompt}`, mode: "guide" });
        if (typeof response.answer === "string" && response.answer.trim()) state.goal = response.answer.trim().slice(0, 500);
      } catch { this.log("warn", "guide_provider_fallback", { sessionId: id }); }
    }
    this.db.prepare("INSERT INTO guide_sessions(id, prompt, learner_level, provider, model, state, outline, history, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, prompt, learnerLevel, selection.provider, selection.model, JSON.stringify(state), JSON.stringify(steps), "[]", time, time);
    return this.get(id);
  }
  save(id, state, history) { this.db.prepare("UPDATE guide_sessions SET state = ?, history = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), JSON.stringify(history.slice(-20)), now(), id); }
  message(id, { answer, action }) {
    const row = this.row(id); if (!row) throw new VeloError("NOT_FOUND", "Guide session not found.");
    const state = JSON.parse(row.state); const outline = JSON.parse(row.outline); const history = JSON.parse(row.history);
    if (state.isComplete) return this.publicSession(row, { feedback: "This lesson is complete. Start a new guide for another problem.", nextQuestion: state.transferQuestion, hint: null, progress: 1, isComplete: true });
    const step = outline[state.currentStep]; let message;
    if (action === "hint") { state.hintLevel += 1; message = { classification: "hint", feedback: "Try this before moving on.", nextQuestion: step.question, hint: step.hint, progress: state.completedSteps.length / outline.length, isComplete: false }; }
    else if (action === "explain") { message = { classification: "explanation", feedback: `This step is about ${step.concept}. ${step.hint}`, nextQuestion: step.question, hint: null, progress: state.completedSteps.length / outline.length, isComplete: false }; }
    else if (action === "visual") { message = { classification: "visual", feedback: "A visual can help identify the objects and changing quantities. Switch to Visualize when you are ready to animate this scenario.", nextQuestion: step.question, hint: null, progress: state.completedSteps.length / outline.length, isComplete: false, visualPrompt: row.prompt }; }
    else {
      const evaluation = action === "skip" ? { classification: "skipped", feedback: "We will reveal this step and continue." } : feedbackFor(answer, step);
      if (evaluation.classification === "misconception") state.misconceptions = [...new Set([...state.misconceptions, step.concept])].slice(-8);
      const advance = action === "skip" || evaluation.classification === "correct" || evaluation.classification === "partly_correct";
      if (advance) { state.completedSteps.push(state.currentStep); state.currentStep += 1; state.hintLevel = 0; if (state.currentStep >= outline.length) state.isComplete = true; }
      const nextQuestion = state.isComplete ? state.transferQuestion : outline[state.currentStep].question;
      message = { ...evaluation, nextQuestion, hint: evaluation.classification === "misconception" ? step.hint : null, progress: state.completedSteps.length / outline.length, isComplete: state.isComplete };
    }
    history.push({ at: now(), action, answer: answer || null, feedback: message.feedback, question: step.question }); this.save(id, state, history);
    return this.publicSession(this.row(id), message);
  }
  remove(id) { if (!this.row(id)) throw new VeloError("NOT_FOUND", "Guide session not found."); this.db.prepare("DELETE FROM guide_sessions WHERE id = ?").run(id); }
  cleanup(retentionDays) { this.db.prepare("DELETE FROM guide_sessions WHERE updated_at < ?").run(new Date(Date.now() - retentionDays * 86400000).toISOString()); }
}
