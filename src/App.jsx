import { useEffect, useLayoutEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Atom,
  CheckCircle,
  CaretDown,
  Compass,
  FilmSlate,
  GearSix,
  Lightbulb,
  Moon,
  Microphone,
  PaperPlaneTilt,
  NotePencil,
  Plus,
  SidebarSimple,
  SpeakerHigh,
  Sparkle,
  SpinnerGap,
  Sun,
  Trash,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import InteractivePanel from "./InteractivePanel.jsx";

const modes = [
  { id: "explain", label: "Explain", icon: Lightbulb },
  { id: "guide", label: "Guide", icon: Compass },
  { id: "visualize", label: "Visualize", icon: Waveform },
  { id: "interactive", label: "Interactive", icon: Atom },
];
const starters = [
  "Why do satellites stay in orbit?",
  "Explain projectile motion simply",
  "Guide me through conservation of energy",
];
// Keep the browser implementation as a fallback while Piper is introduced.
const BROWSER_TTS_ENABLED = true;

const INITIAL_TUTOR_RESULT = {
  title: "Ask anything about physics",
  answer:
    "Choose how you want to learn, then send a question. Velo can explain the idea, guide you with one step at a time, or prepare a visual model.",
  nextStep: "Try one of the prompts below, or write your own.",
};

const TUTOR_MODES = ["explain", "guide", "visualize", "interactive"];
const createInitialOutputCards = () =>
  Object.fromEntries(
    TUTOR_MODES.map((mode) => [mode, { visible: true, result: INITIAL_TUTOR_RESULT }]),
  );

const superscriptCharacters = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const subscriptCharacters = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ" };
const mathSymbols = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", phi: "φ", omega: "ω", Delta: "Δ", Gamma: "Γ", Sigma: "Σ", Omega: "Ω", times: "×", cdot: "·", pm: "±", sqrt: "√", partial: "∂", nabla: "∇", infty: "∞", approx: "≈", neq: "≠", leq: "≤", geq: "≥" };

function formatEquation(latex = "") {
  let result = latex.replace(/\\vec\s*(?:\{\s*([^{}]+)\s*\}|([A-Za-z]))/g, (_, grouped, single) => `${grouped || single}⃗`);
  let previous;
  do {
    previous = result;
    result = result.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  } while (result !== previous);
  result = result.replace(/\\([A-Za-z]+)/g, (_, command) => mathSymbols[command] || command);
  result = result.replace(/\^\s*(?:\{([^{}]+)\}|([^\s]))/g, (_, grouped, single) => [...(grouped || single)].map((character) => superscriptCharacters[character] || character).join(""));
  return result.replace(/_\s*(?:\{([^{}]+)\}|([^\s]))/g, (_, grouped, single) => [...(grouped || single)].map((character) => subscriptCharacters[character] || character).join(""));
}

function renderEquation(latex = "", { displayMode = true } = {}) {
  return { __html: katex.renderToString(latex, { displayMode, throwOnError: false, strict: "ignore", trust: false }) };
}

const mathDelimiterPattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$)/g;
const inlineMarkdownPattern = /(\*\*[^*\n]+\*\*|\x60[^\x60\n]+\x60|\*[^*\n]+\*)/g;

function unwrapMathDelimiters(value = "") {
  const text = value.trim();
  if (text.startsWith("$$") && text.endsWith("$$")) return { latex: text.slice(2, -2).trim(), displayMode: true };
  if (text.startsWith("\\[") && text.endsWith("\\]")) return { latex: text.slice(2, -2).trim(), displayMode: true };
  if (text.startsWith("\\(") && text.endsWith("\\)")) return { latex: text.slice(2, -2).trim(), displayMode: false };
  return null;
}

function equationLatex(section) {
  return (unwrapMathDelimiters(section?.latex || "")?.latex || section?.latex || section?.text || "").trim();
}

function renderInlineContent(text = "", keyPrefix = "text") {
  return String(text).split(mathDelimiterPattern).flatMap((part, mathIndex) => {
    const math = unwrapMathDelimiters(part);
    if (math) return [<span key={[keyPrefix, "math", mathIndex].join("-")} className={math.displayMode ? "math-display" : "math-inline"} dangerouslySetInnerHTML={renderEquation(math.latex, { displayMode: math.displayMode })} />];
    return part.split(inlineMarkdownPattern).map((token, markdownIndex) => {
      const key = [keyPrefix, mathIndex, markdownIndex].join("-");
      if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
      if (token.startsWith(String.fromCharCode(96)) && token.endsWith(String.fromCharCode(96))) return <code key={key} className="markdown-inline-code">{token.slice(1, -1)}</code>;
      if (token.startsWith("*") && token.endsWith("*")) return <em key={key}>{token.slice(1, -1)}</em>;
      return token;
    });
  });
}

function MarkdownContent({ text }) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const bullet = lines[index].match(/^\s*[-+*]\s+(.+)$/);
    const numbered = lines[index].match(/^\s*\d+\.\s+(.+)$/);
    if (bullet || numbered) {
      const listItems = [];
      const pattern = bullet ? /^\s*[-+*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (index < lines.length) {
        const match = lines[index].match(pattern);
        if (!match) break;
        listItems.push(match[1]);
        index += 1;
      }
      const List = bullet ? "ul" : "ol";
      blocks.push(<List key={["list", index].join("-")} className="markdown-list">{listItems.map((item, itemIndex) => <li key={[index, itemIndex].join("-")}>{renderInlineContent(item, ["list", index, itemIndex].join("-"))}</li>)}</List>);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !lines[index].match(/^\s*[-+*]\s+(.+)$/) && !lines[index].match(/^\s*\d+\.\s+(.+)$/)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={["paragraph", index].join("-")}>{paragraph.flatMap((line, lineIndex) => [lineIndex > 0 ? <br key={["break", index, lineIndex].join("-")} /> : null, ...renderInlineContent(line, ["paragraph", index, lineIndex].join("-"))])}</p>);
  }

  return blocks;
}

function ExplanationSectionContent({ section }) {
  if (section.kind === "equation") {
    const latex = equationLatex(section);
    const description = section.latex && section.text && section.text.trim() !== section.latex.trim() ? section.text : "";
    return <>{latex && <div className="equation" aria-label={section.spokenText} dangerouslySetInnerHTML={renderEquation(latex)} />}{description && <MarkdownContent text={description} />}</>;
  }
  return <MarkdownContent text={section.text || section.latex || ""} />;
}

const defaultProviderSettings = {
  base: { provider: "local", model: "" },
  interactive: { provider: "", model: "" },
  visualize: { provider: "", model: "" },
};

function savedProviderSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("velo-provider-settings") || "{}");
    return {
      base: { ...defaultProviderSettings.base, ...saved.base },
      interactive: { ...defaultProviderSettings.interactive, ...saved.interactive },
      visualize: { ...defaultProviderSettings.visualize, ...saved.visualize },
    };
  } catch {
    return defaultProviderSettings;
  }
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun weight="fill" /> : <Moon weight="fill" />}
    </button>
  );
}

function ProviderSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  return <div className="provider-select"><button type="button" className="provider-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{selected?.label || "Not configured"}<CaretDown weight="bold" /></button>{open && <div className="provider-select-menu" role="listbox"><button type="button" role="option" aria-selected={!value} onClick={() => { onChange(""); setOpen(false); }}>Not configured</button>{options.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); }}>{option.label}</button>)}</div>}</div>;
}

const explanationSectionLabels = {
  intuition: "Intuition",
  detail: "Detail",
  equation: "Equation",
  example: "Example",
  assumptions: "Assumptions",
  recap: "Recap",
  definition: "Definition",
  derivation: "Derivation",
  units: "Units",
  limitations: "Limitations",
  text: "Explanation",
};

function explanationSectionLabel(kind) {
  const normalized = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (explanationSectionLabels[normalized]) return explanationSectionLabels[normalized];
  return normalized ? normalized.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Explanation";
}

function TurnReview({ turn, onReturn }) {
  const [reviewLevel, setReviewLevel] = useState("structured");
  const response = turn.response || {};
  const hasVariants = Boolean(response.variants);
  const activeResponse = response.variants?.[reviewLevel] || response;
  const sections = Array.isArray(activeResponse.sections) ? activeResponse.sections : [];

  useEffect(() => setReviewLevel("structured"), [turn.id]);

  return (
    <section className="turn-review" aria-live="polite">
      <div className="turn-review-header">
        <span>Viewing earlier response</span>
        <button type="button" onClick={onReturn}>Return to latest</button>
      </div>
      <p className="turn-review-prompt">{turn.prompt}</p>
      {hasVariants && (
        <div className="turn-review-levels level-controls" aria-label="Explanation depth">
          <button type="button" className={reviewLevel === "simpler" ? "active" : ""} onClick={() => setReviewLevel("simpler")}>Simpler</button>
          <button type="button" className={reviewLevel === "structured" ? "active" : ""} onClick={() => setReviewLevel("structured")}>Structured</button>
          <button type="button" className={reviewLevel === "technical" ? "active" : ""} onClick={() => setReviewLevel("technical")}>More technical</button>
        </div>
      )}
      {(activeResponse.title || response.title) && <h2>{activeResponse.title || response.title}</h2>}
      {(activeResponse.summary || response.summary) && <p>{activeResponse.summary || response.summary}</p>}
      {sections.map((section, index) => (
        <article key={`${section.kind}-${index}`}>
          <strong>{explanationSectionLabel(section.kind)}</strong>
          <ExplanationSectionContent section={section} />
        </article>
      ))}
      {activeResponse.checkQuestion && <article><strong>Check your understanding</strong><p>{activeResponse.checkQuestion}</p></article>}
      {response.currentQuestion && <article><strong>Guide question</strong><p>{response.currentQuestion}</p>{response.message?.feedback && <p>{response.message.feedback}</p>}</article>}
      {!response.title && !response.currentQuestion && response.message?.feedback && <p>{response.message.feedback}</p>}
    </section>
  );
}

function WorkspaceDrawer({ open, onClose, groups, activeIds, onOpen, onNew, onDelete }) {
  if (!open) return null;
  const details = [{ kind: "tutor", title: "Chats", create: "New tutor chat" }];
  return <div className="workspace-drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="workspace-drawer" aria-label="Workspace history"><header><strong>Workspaces</strong><button type="button" onClick={onClose} aria-label="Close workspace history">&times;</button></header>{details.map(({ kind, title, create }) => <section key={kind}><div className="workspace-drawer-heading"><h2>{title}</h2><button type="button" onClick={() => onNew(kind)}>{create}</button></div>{groups[kind]?.length ? <ul>{groups[kind].map((thread) => <li key={thread.id}><button type="button" className={activeIds[kind] === thread.id ? "active" : ""} onClick={() => onOpen(thread)}><strong>{thread.title}</strong></button><button type="button" className="workspace-delete" onClick={() => onDelete(thread)} aria-label={`Delete ${thread.title}`}><Trash weight="bold" /></button></li>)}</ul> : <p>No saved {title.toLowerCase()} yet.</p>}</section>)}</aside></div>;
}

function Home({ onStart, theme, onToggleTheme }) {
  return (
    <main className="home-screen">
      <nav className="home-nav" aria-label="Welcome navigation">
        <a className="brand" href="#top" aria-label="Velo home">
          <span className="brand-icon">
            <Atom weight="duotone" />
          </span>
          <span>Velo</span>
        </a>
        <div className="home-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="nav-start" onClick={onStart}>
            Open tutor <ArrowRight weight="bold" />
          </button>
        </div>
      </nav>
      <section className="hero" id="top">
        <div className="hero-kicker">
          <Sparkle weight="fill" /> A quieter way to understand physics
        </div>
        <h1>
          Physics,
          <br />
          <span>made clear.</span>
        </h1>
        <p>
          Ask a question. Explore it from every angle. Hear the explanation when
          reading isn’t enough.
        </p>
        <button className="primary-cta" onClick={onStart}>
          Get started <ArrowRight weight="bold" />
        </button>
        <p className="no-login">No account. No setup. Just start asking.</p>
      </section>
      <section className="feature-row" aria-label="Product features">
        <article>
          <Lightbulb weight="duotone" />
          <div>
            <strong>Understand</strong>
            <span>Clear explanations, at your pace.</span>
          </div>
        </article>
        <article>
          <Compass weight="duotone" />
          <div>
            <strong>Discover</strong>
            <span>Guided questions that build intuition.</span>
          </div>
        </article>
        <article>
          <SpeakerHigh weight="duotone" />
          <div>
            <strong>Listen</strong>
            <span>Natural text-to-speech built in.</span>
          </div>
        </article>
      </section>
    </main>
  );
}

function AnimationCard({ job, onOpen, onCancel }) {
  const active = ["queued", "running"].includes(job.status);
  const label =
    job.status === "complete"
      ? "Ready"
      : job.status === "cancelled"
        ? "Cancelled"
        : job.status === "failed"
          ? "Failed"
          : job.stage;
  return (
    <article className={`visualization-card ${job.status}`}>
      <button
        type="button"
        className="visualization-card-open"
        onClick={(event) => onOpen(job, event)}
      >
        <span className="visualization-card-status">
          {active ? (
            <SpinnerGap className="spin" weight="bold" />
          ) : job.status === "complete" ? (
            <FilmSlate weight="fill" />
          ) : (
            <WarningCircle weight="fill" />
          )}
        </span>
        <span className="visualization-card-copy">
          <strong>{job.prompt || "Earlier visualization"}</strong>
          <span>
            {job.queuePosition ? `Queue position ${job.queuePosition}` : label}
          </span>
        </span>
      </button>
      {active && (
        <button
          type="button"
          className="visualization-card-cancel"
          onClick={() => onCancel(job.id)}
        >
          Cancel
        </button>
      )}
    </article>
  );
}

function PhysicsDiagram({ type }) {
  if (type === "orbit")
    return (
      <svg
        className="physics-diagram"
        viewBox="0 0 260 120"
        role="img"
        aria-label="A satellite travelling around Earth"
      >
        <circle cx="70" cy="60" r="28" fill="currentColor" opacity=".22" />
        <circle
          cx="70"
          cy="60"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <circle cx="112" cy="40" r="5" fill="currentColor" />
        <path
          d="M112 40l-13 2 7 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  if (type === "force")
    return (
      <svg
        className="physics-diagram"
        viewBox="0 0 260 120"
        role="img"
        aria-label="A box with opposing force arrows"
      >
        <rect
          x="105"
          y="45"
          width="50"
          height="35"
          rx="4"
          fill="currentColor"
          opacity=".2"
        />
        <path
          d="M95 62H35m0 0 10-8m-10 8 10 8M165 62h60m0 0-10-8m10 8-10 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
    );
  if (type === "graph")
    return (
      <svg
        className="physics-diagram"
        viewBox="0 0 260 120"
        role="img"
        aria-label="A graph showing energy changing over time"
      >
        <path
          d="M35 15v80h190M45 82c38-4 55-20 80-44s49-20 88-56"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
    );
  return null;
}

function ExplainResponse({
  explanation,
  learnerLevel,
  setLearnerLevel,
  onSpeak,
  speechState,
  onVisualize,
  ttsEnabled,
}) {
  if (!explanation) return null;
  const variantKey = learnerLevel === "current" ? "structured" : learnerLevel;
  const activeVariant = explanation.variants?.[variantKey] || explanation;
  const sections = activeVariant.sections || [];
  return (
    <section className="explain-response" aria-live="polite">
      <div className="explain-toolbar">
        <div className="level-controls" aria-label="Explanation depth">
          <button
            onClick={() => setLearnerLevel("simpler")}
            className={learnerLevel === "simpler" ? "active" : ""}
          >
            Simpler
          </button>
          <button
            onClick={() => setLearnerLevel("current")}
            className={learnerLevel === "current" ? "active" : ""}
          >
            Structured
          </button>
          <button
            onClick={() => setLearnerLevel("technical")}
            className={learnerLevel === "technical" ? "active" : ""}
          >
            More technical
          </button>
        </div>
        <div className="speech-controls">
          <button disabled={!ttsEnabled} onClick={() => onSpeak("all", activeVariant.spokenText)}>
            {speechState.status === "speaking"
              ? "Pause"
              : speechState.status === "paused"
                ? "Resume"
                : "Listen"}
          </button>
          <button disabled={!ttsEnabled} onClick={() => onSpeak("restart", activeVariant.spokenText)}>Restart</button>
          <select
            value={speechState.rate}
            disabled={!ttsEnabled}
            onChange={(event) => onSpeak("rate", Number(event.target.value))}
            aria-label="Speech speed"
          >
            <option value="0.8">0.8×</option>
            <option value="1">1×</option>
            <option value="1.2">1.2×</option>
          </select>
        </div>
      </div>
      <h1>{explanation.title || "Building your explanation…"}</h1>
      {activeVariant.summary && (
        <p className="explain-summary">{activeVariant.summary}</p>
      )}
      <PhysicsDiagram type={explanation.visualSuggestion} />
      {sections.map((section, index) => (
        <article
          className={`explain-section ${section.kind}`}
          key={`${section.kind}-${index}`}
        >
          <div>
            <span>{explanationSectionLabel(section.kind)}</span>
            <ExplanationSectionContent section={section} />
          </div>
          <button
            className="section-listen"
            disabled={!ttsEnabled}
            onClick={() =>
              onSpeak("section", section.spokenText || section.text)
            }
            aria-label={`Listen to ${section.kind}`}
            title={`Listen to ${section.kind}`}
          >
            <SpeakerHigh weight="fill" />
          </button>
        </article>
      ))}
      {activeVariant.checkQuestion && (
        <div className="explain-check">
          <strong>Check your understanding</strong>
          <p>{activeVariant.checkQuestion}</p>
        </div>
      )}
      {explanation.visualSuggestion && (
        <button className="explain-visualize" onClick={onVisualize}>
          Visualize this idea
        </button>
      )}
    </section>
  );
}

function GuidePanel({ session, onAction, onStartOver }) {
  if (!session) return null;
  return (
    <section className="guide-panel" aria-live="polite">
      <div className="guide-progress">
        <span>Guide progress</span>
        <strong>{Math.round(session.progress * 100)}%</strong>
        <div>
          <i style={{ width: `${session.progress * 100}%` }} />
        </div>
      </div>
      <h1>{session.goal}</h1>
      <p className="guide-question">
        {session.message?.nextQuestion || session.currentQuestion}
      </p>
      {session.message?.feedback && (
        <p className="guide-feedback">{session.message.feedback}</p>
      )}
      {session.message?.hint && (
        <p className="guide-hint">Hint: {session.message.hint}</p>
      )}
      <div className="guide-actions">
        <button onClick={() => onAction("hint")}>Hint</button>
        <button onClick={() => onAction("explain")}>Explain this step</button>
        <button onClick={() => onAction("skip")}>Skip</button>
        <button onClick={() => onAction("visual")}>Show a visual</button>
        <button onClick={onStartOver}>Start over</button>
      </div>
      {session.history.length > 0 && (
        <details className="guide-history">
          <summary>Previous steps ({session.history.length})</summary>
          {session.history.map((item, index) => (
            <p key={`${item.at}-${index}`}>
              <strong>{item.question}</strong>
              <br />
              {item.feedback}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}

function Tutor({ onBack, theme, onToggleTheme }) {
  const [mode, setMode] = useState("explain");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState(null);
  const [outputCards, setOutputCards] = useState(createInitialOutputCards);
  const [speaking, setSpeaking] = useState(false);
  const [speechState, setSpeechState] = useState({ status: "idle", rate: 1 });
  const [learnerLevel, setLearnerLevel] = useState("current");
  const [explanation, setExplanation] = useState(null);
  const [explainSessionId, setExplainSessionId] = useState(
    () => sessionStorage.getItem("velo-explain-session") || "",
  );
  const [guideSession, setGuideSession] = useState(null);
  const [animationJobs, setAnimationJobs] = useState([]);
  const [selectedAnimationId, setSelectedAnimationId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [animationError, setAnimationError] = useState("");
  const [interactive, setInteractive] = useState(null);
  const [interactiveTimeline, setInteractiveTimeline] = useState(null);
  const [interactiveError, setInteractiveError] = useState("");
  const [interactiveExport, setInteractiveExport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [providerStatus, setProviderStatus] = useState({});
  const [credentialStorage, setCredentialStorage] = useState({ available: true });
  const [settings, setSettings] = useState(savedProviderSettings);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [workspaceGroups, setWorkspaceGroups] = useState({ tutor: [] });
  const [activeWorkspaceIds, setActiveWorkspaceIds] = useState({ tutor: null });
  const [tutorWorkspace, setTutorWorkspace] = useState(null);
  const [tutorTurnIndex, setTutorTurnIndex] = useState(null);
  const [tutorHistoryOpen, setTutorHistoryOpen] = useState(false);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const cardTriggerRef = useRef(null);
  const utteranceRef = useRef(null);
  const voiceOrbCoreRef = useRef(null);
  const voiceOrbPulseTimerRef = useRef(null);
  const [result, setResult] = useState(INITIAL_TUTOR_RESULT);
  const activeOutputCard = outputCards[mode] || {
    visible: true,
    result: INITIAL_TUTOR_RESULT,
  };
  const isOutputCardLoading = loading && loadingMode === mode;
  function setOutputCard(modeId, updates) {
    setOutputCards((current) => ({
      ...current,
      [modeId]: {
        ...(current[modeId] || {
          visible: true,
          result: INITIAL_TUTOR_RESULT,
        }),
        ...updates,
      },
    }));
  }
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const maximumHeight = 168;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, maximumHeight)}px`;
    input.style.overflowY = input.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [prompt]);
  const effectiveSelection = (kind) => {
    const dedicated = settings[kind];
    return dedicated?.provider && dedicated?.model ? dedicated : settings.base;
  };
  const isVisualizationAvailable = (kind) => {
    const selection = effectiveSelection(kind);
    return selection.provider === "ollama" && Boolean(selection.model);
  };
  const composerSelection = ["visualize", "interactive"].includes(mode)
    ? effectiveSelection(mode)
    : settings.base;
  const composerProvider = availableProviders.find(
    (provider) => provider.id === composerSelection.provider,
  );
  const composerModelLabel =
    composerSelection.model || composerProvider?.label || "Velo local";
  const saveSettings = () => {
    localStorage.setItem("velo-provider-settings", JSON.stringify(settings));
    setSettingsOpen(false);
  };
  useEffect(() => { fetch("/api/settings/providers").then((response) => response.json()).then((data) => setAvailableProviders(data.providers || [])).catch(() => setAvailableProviders([])); fetch("/api/settings/credentials").then((response) => response.json()).then((data) => setCredentialStorage(data.storage || { available: true })).catch(() => setCredentialStorage({ available: false, reason: "Secure credential storage could not be checked." })); void refreshWorkspaces().catch(() => {}); }, []);
  async function testProvider(kind) { const selection = effectiveSelection(kind); setProviderStatus((current) => ({ ...current, [kind]: { pending: true } })); try { const response = await fetch("/api/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selection) }); const data = await response.json(); setProviderStatus((current) => ({ ...current, [kind]: response.ok ? { ...data, pending: false, tested: true } : { ok: false, pending: false, tested: true, message: data.error?.message || "Connection test failed." } })); } catch { setProviderStatus((current) => ({ ...current, [kind]: { ok: false, pending: false, tested: true, message: "Connection test could not be completed." } })); } }
  async function saveApiKey(kind) { const input = document.getElementById(`${kind}-api-key`); const apiKey = input?.value || ""; const provider = settings[kind]?.provider; if (!apiKey || !["openai", "anthropic"].includes(provider)) return; const response = await fetch("/api/settings/credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, apiKey }) }); input.value = ""; setProviderStatus((current) => ({ ...current, [kind]: { saved: response.ok, pending: false, message: response.ok ? "API key saved securely. Test the connection to verify it." : "API key could not be saved." } })); }
  async function refreshWorkspaces() {
    const kinds = ["tutor"];
    const entries = await Promise.all(kinds.map(async (kind) => {
      const response = await fetch(`/api/workspaces?kind=${kind}`);
      const data = await response.json();
      return [kind, response.ok ? data.workspaces || [] : []];
    }));
    setWorkspaceGroups(Object.fromEntries(entries));
  }
  async function refreshTutorWorkspace(id, { selectLatest = true } = {}) {
    if (!id) return;
    const response = await fetch(`/api/workspaces/${id}`);
    if (!response.ok) return;
    const workspace = await response.json();
    setTutorWorkspace(workspace);
    setActiveWorkspaceIds((current) => ({ ...current, tutor: id }));
    if (selectLatest) setTutorTurnIndex(Math.max(0, workspace.turns.length - 1));
    void refreshWorkspaces();
  }
  async function openWorkspace(thread) {
    const response = await fetch(`/api/workspaces/${thread.id}`);
    if (!response.ok) return;
    const workspace = await response.json();
    const latest = workspace.turns.at(-1);
    setActiveWorkspaceIds((current) => ({ ...current, tutor: workspace.id }));
    const workspaceMode = latest?.mode === "guide" ? "guide" : "explain";
    setMode(workspaceMode); setTutorWorkspace(workspace); setTutorTurnIndex(Math.max(0, workspace.turns.length - 1)); setOutputCard(workspaceMode, { visible: false });
    if (latest?.mode === "guide" && latest.response) setGuideSession(latest.response);
    if (latest?.mode === "explain" && latest.response) setExplanation(latest.response);
    setWorkspaceDrawerOpen(false);
  }
  function newWorkspace() {
    setActiveWorkspaceIds((current) => ({ ...current, tutor: null }));
    setPrompt("");
    setMode("explain"); setTutorWorkspace(null); setTutorTurnIndex(null); setExplanation(null); setGuideSession(null); setExplainSessionId(""); setResult(INITIAL_TUTOR_RESULT); setOutputCards(createInitialOutputCards()); sessionStorage.removeItem("velo-explain-session");
    setWorkspaceDrawerOpen(false);
  }
  async function deleteWorkspace(thread) {
    if (!window.confirm("Delete this chat and all of its saved turns?")) return;
    const response = await fetch(`/api/workspaces/${thread.id}`, { method: "DELETE" });
    if (!response.ok) return;
    if (activeWorkspaceIds.tutor === thread.id) newWorkspace();
    await refreshWorkspaces();
  }

  async function refreshAnimations() {
    try {
      const response = await fetch("/api/animations?limit=50");
      const data = await response.json();
      if (response.ok) {
        setAnimationJobs(data.jobs);
        setAnimationError("");
      }
    } catch {
      /* Keep saved cards visible while reconnecting. */
    }
  }

  useEffect(() => {
    void refreshAnimations();
    const timer = window.setInterval(refreshAnimations, 1200);
    return () => {
      window.clearInterval(timer);
      window.speechSynthesis?.cancel();
      window.clearTimeout(voiceOrbPulseTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const id = interactive?.visualizationId;
    if (!id || interactiveTimeline) return;
    const stream = new EventSource(`/api/visualizations/${id}/events`);
    const receive = async (event) => {
      const update = JSON.parse(event.data);
      setInteractive((current) => ({ ...current, ...update }));
      if (update.status === "completed" || update.stage === "ready") {
        const response = await fetch(`/api/visualizations/${id}/timeline`);
        const data = await response.json();
        if (response.ok) {
          setInteractiveTimeline(data.timeline);
          stream.close();
        } else
          setInteractiveError(data.error?.message || "Timeline unavailable.");
      }
      if (["failed", "cancelled"].includes(update.status)) {
        setInteractiveError(
          update.error?.message || "Interactive visualization stopped.",
        );
        stream.close();
      }
    };
    stream.addEventListener("visualization", receive);
    return () => stream.close();
  }, [interactive?.visualizationId, interactiveTimeline]);

  const selectedAnimation =
    animationJobs.find((job) => job.id === selectedAnimationId) || null;
  useEffect(() => {
    if (!selectedAnimation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelectedAnimationId(null);
      if (event.key === "Tab" && dialogRef.current) {
        const controls = dialogRef.current.querySelectorAll(
          "button, video[controls]",
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      cardTriggerRef.current?.focus();
    };
  }, [selectedAnimationId]);

  async function generateAnimation(question) {
    try {
      const response = await fetch("/api/animations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: question, ...effectiveSelection("visualize") }),
      });
      const job = await response.json();
      if (!response.ok)
        throw new Error(job.error?.message || "MotionForge could not start.");
      setAnimationJobs((jobs) => [
        job,
        ...jobs.filter((item) => item.id !== job.id),
      ]);
      void refreshAnimations();
    } catch (error) {
      setAnimationError(error.message);
    }
  }
  async function generateInteractive(question) {
    setInteractiveError("");
    setInteractiveTimeline(null);
    setInteractiveExport(null);
    try {
      const response = await fetch("/api/visualizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: question,
          preferTemplate: true,
          ...effectiveSelection("interactive"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message || "Interactive mode is unavailable.",
        );
      setInteractive({
        ...data,
        prompt: question,
        stage: "Starting simulation",
      });
    } catch (error) {
      setInteractiveError(error.message);
    }
  }
  async function updateInteractive(parameters) {
    if (!interactive?.visualizationId) return;
    setInteractiveTimeline(null);
    const response = await fetch(
      `/api/visualizations/${interactive.visualizationId}/parameters`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parameters }),
      },
    );
    if (!response.ok) {
      const data = await response.json();
      setInteractiveError(data.error?.message || "Parameter update failed.");
    }
  }
  async function exportInteractive() {
    if (!interactive?.visualizationId) return;
    setInteractiveExport("Exporting MP4 in the background…");
    try {
      const response = await fetch(
        `/api/visualizations/${interactive.visualizationId}/exports`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ options: { preset: "preview" } }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "MP4 export could not start.");
      setInteractiveExport(
        "MP4 export queued. The interactive timeline remains available.",
      );
    } catch (error) {
      setInteractiveExport(`MP4 export failed: ${error.message}`);
    }
  }

  async function cancelAnimation(id) {
    try {
      const response = await fetch(`/api/animations/${id}/cancel`, {
        method: "POST",
      });
      const job = await response.json();
      if (!response.ok)
        throw new Error(
          job.error?.message || "The animation could not be cancelled.",
        );
      setAnimationJobs((jobs) =>
        jobs.map((item) => (item.id === id ? job : item)),
      );
    } catch (error) {
      setAnimationError(error.message);
    }
  }
  async function deleteAnimation(id) {
    if (!window.confirm("Delete this visualization and its saved video?"))
      return;
    try {
      const response = await fetch(`/api/animations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.error?.message || "The visualization could not be deleted.",
        );
      }
      setAnimationJobs((jobs) => jobs.filter((job) => job.id !== id));
      setSelectedAnimationId(null);
    } catch (error) {
      setAnimationError(error.message);
    }
  }
  function openAnimation(job, event) {
    cardTriggerRef.current = event.currentTarget;
    setSelectedAnimationId(job.id);
  }
  function useStarter(text) {
    setPrompt(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  async function streamExplain(question) {
    setExplanation({
      title: "Building your explanation…",
      summary: "",
      sections: [],
      visualSuggestion: null,
    });
    const response = await fetch("/api/explain/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: question,
        sessionId: explainSessionId || undefined,
        workspaceId: activeWorkspaceIds.tutor || undefined,
        ...settings.base,
      }),
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        data.error?.message || "Velo could not build that explanation.",
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let workspaceId = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop();
      for (const message of messages) {
        const event = message.match(/^event: (.+)$/m)?.[1];
        const data = message.match(/^data: (.+)$/m)?.[1];
        if (!event || !data) continue;
        const payload = JSON.parse(data);
        if (event === "meta") {
          setExplainSessionId(payload.sessionId);
          sessionStorage.setItem("velo-explain-session", payload.sessionId);
          workspaceId = payload.workspaceId || workspaceId;
          if (workspaceId) setActiveWorkspaceIds((current) => ({ ...current, tutor: workspaceId }));
          setExplanation((current) => ({ ...current, ...payload }));
        }
        if (event === "section")
          setExplanation((current) => ({
            ...current,
            sections: [...current.sections, payload],
          }));
        if (event === "complete")
          setExplanation((current) => ({ ...current, ...payload }));
      }
    }
    if (workspaceId) await refreshTutorWorkspace(workspaceId);
  }
  function explainSpeech(action, text) {
    if (!BROWSER_TTS_ENABLED || !("speechSynthesis" in window)) return;
    if (action === "rate") {
      setSpeechState((state) => ({ ...state, rate: text }));
      return;
    }
    if (action === "restart") {
      window.speechSynthesis.cancel();
      setSpeechState((state) => ({ ...state, status: "idle" }));
      if (text || explanation?.spokenText) setTimeout(() => explainSpeech("all", text), 0);
      return;
    }
    if (action === "all" && speechState.status === "speaking") {
      window.speechSynthesis.pause();
      setSpeechState((state) => ({ ...state, status: "paused" }));
      return;
    }
    if (action === "all" && speechState.status === "paused") {
      window.speechSynthesis.resume();
      setSpeechState((state) => ({ ...state, status: "speaking" }));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text || explanation?.spokenText || "",
    );
    utterance.rate = speechState.rate;
    utterance.onstart = () =>
      setSpeechState((state) => ({ ...state, status: "speaking" }));
    utterance.onend = () =>
      setSpeechState((state) => ({ ...state, status: "idle" }));
    utterance.onerror = () =>
      setSpeechState((state) => ({ ...state, status: "idle" }));
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }
  async function startGuide(question) {
    const response = await fetch("/api/guide/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: question, learnerLevel, workspaceId: activeWorkspaceIds.tutor || undefined, ...settings.base }),
    });
    const session = await response.json();
    if (!response.ok)
      throw new Error(
        session.error?.message || "Velo could not start this guide.",
      );
    setGuideSession(session);
    if (session.workspaceId) await refreshTutorWorkspace(session.workspaceId);
  }
  async function guideAction(action, answerOverride = null) {
    if (!guideSession) return;
    try {
      const response = await fetch(
        `/api/guide/sessions/${guideSession.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            answer: action === "answer" ? (answerOverride ?? prompt.trim()) : "",
            workspaceId: activeWorkspaceIds.tutor || undefined,
          }),
        },
      );
      const session = await response.json();
      if (!response.ok)
        throw new Error(
          session.error?.message || "The guide could not continue.",
        );
      setGuideSession(session);
      if (activeWorkspaceIds.tutor) await refreshTutorWorkspace(activeWorkspaceIds.tutor);
      if (action === "visual") {
        setMode("visualize");
        setPrompt(session.message?.visualPrompt || guideSession.prompt);
      } else if (action === "answer") setPrompt("");
      return true;
    } catch (error) {
      const guideError = {
        title: "Guide interrupted",
        answer: error.message,
        nextStep: "Try again in a moment.",
      };
      setResult(guideError);
      setOutputCard("guide", { visible: true, result: guideError });
      return false;
    }
  }
  async function startGuideOver() {
    if (!guideSession) return;
    await fetch(`/api/guide/sessions/${guideSession.id}`, { method: "DELETE" });
    setGuideSession(null);
  }
  function resetVoiceOrb() {
    window.clearTimeout(voiceOrbPulseTimerRef.current);
    if (voiceOrbCoreRef.current) voiceOrbCoreRef.current.style.transform = "scale(1)";
  }
  function pulseVoiceOrb(word) {
    const length = word.replace(/[^a-z0-9]/gi, "").length;
    const scale = Math.min(1.3, 1.08 + length * 0.03);
    window.clearTimeout(voiceOrbPulseTimerRef.current);
    if (voiceOrbCoreRef.current) voiceOrbCoreRef.current.style.transform = `scale(${scale})`;
    voiceOrbPulseTimerRef.current = window.setTimeout(resetVoiceOrb, 500);
  }
  function speak() {
    if (!BROWSER_TTS_ENABLED || !("speechSynthesis" in window) || loading) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      resetVoiceOrb();
      setSpeaking(false);
      return;
    }
    const spokenResponse = `${result.title}. ${result.answer}. ${result.nextStep || ""}`;
    const speech = new SpeechSynthesisUtterance(spokenResponse);
    speech.rate = 0.94;
    speech.pitch = 1;
    speech.onstart = () => setSpeaking(true);
    speech.onboundary = (event) => {
      if (event.name !== "word") return;
      pulseVoiceOrb(spokenResponse.slice(event.charIndex, event.charIndex + event.charLength));
    };
    speech.onend = () => { resetVoiceOrb(); setSpeaking(false); };
    speech.onerror = () => { resetVoiceOrb(); setSpeaking(false); };
    utteranceRef.current = speech;
    window.speechSynthesis.speak(speech);
  }
  async function submit(event) {
    event?.preventDefault();
    const question = prompt.trim();
    if (!question || loading) return;
    const submittedMode = mode;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(true);
    setLoadingMode(submittedMode);
    setOutputCard(submittedMode, { visible: true });
    setPrompt("");
    try {
      let requestSucceeded = true;
      if (submittedMode === "explain") {
        await streamExplain(question);
      } else if (submittedMode === "guide") {
        if (guideSession) requestSucceeded = await guideAction("answer", question);
        else await startGuide(question);
      } else if (submittedMode === "visualize") {
        await generateAnimation(question);
      } else if (submittedMode === "interactive") {
        await generateInteractive(question);
      } else {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: question, mode: submittedMode, ...settings.base }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message ||
              data.error ||
              "Velo could not answer that yet.",
        );
        setResult(data);
      }
      if (requestSucceeded) setOutputCard(submittedMode, { visible: false });
    } catch (error) {
      const requestError = {
        title: "Connection interrupted",
        answer: error.message,
        nextStep: "Make sure the local backend is running, then try again.",
      };
      setResult(requestError);
      setOutputCard(submittedMode, { visible: true, result: requestError });
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  }

  const latestAnimation = animationJobs[0] || null;
  const historyJobs = animationJobs.slice(1);
  const tutorTurns = tutorWorkspace?.turns || [];
  const latestTutorTurnIndex = Math.max(0, tutorTurns.length - 1);
  const selectedTutorTurn = tutorTurns[tutorTurnIndex ?? latestTutorTurnIndex] || null;
  const viewingEarlierTutorTurn = selectedTutorTurn && (tutorTurnIndex ?? latestTutorTurnIndex) !== latestTutorTurnIndex;
  const displayTime = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "";

  return (
    <main className="tutor-screen">
      <header className="tutor-header">
        <div className="header-start">
          <button className="settings-button" onClick={() => setWorkspaceDrawerOpen(true)} aria-label="Open workspace history">
            <SidebarSimple weight="bold" />
          </button>
          <button className="new-workspace-button" onClick={newWorkspace} aria-label="New tutor chat" title="New tutor chat">
            <NotePencil weight="bold" />
          </button>
        </div>
        <a
          className="brand compact"
          href="#"
          aria-label="Back to Velo home"
          onClick={(event) => {
            event.preventDefault();
            onBack();
          }}
        >
          <span className="brand-icon">
            <Atom weight="duotone" />
          </span>
          <span>Velo</span>
        </a>
        <div className="header-actions">
          <button
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Provider settings"
          >
            <GearSix weight="bold" />
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>
      <div className="tutor-body">
        <section className="mode-section" aria-labelledby="mode-label">
          <p id="mode-label">How would you like to learn?</p>
          <div className="mode-switcher">
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={mode === id ? "active" : ""}
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                disabled={
                  ["visualize", "interactive"].includes(id) &&
                  !isVisualizationAvailable(id)
                }
                title={
                  ["visualize", "interactive"].includes(id) &&
                  !isVisualizationAvailable(id)
                    ? "Configure a provider and model in Settings to enable this mode."
                    : undefined
                }
              >
                <Icon weight={mode === id ? "fill" : "regular"} />
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="voice-section">
          <button
            className={`voice-button voice-orb ${speaking ? "is-speaking" : ""}`}
            onClick={speak}
            disabled={!BROWSER_TTS_ENABLED}
            aria-label={BROWSER_TTS_ENABLED ? (speaking ? "Stop speaking" : "Read response aloud") : "Local voice is coming soon"}
            aria-pressed={speaking}
          >
            <span className="voice-orb__ring voice-orb__ring--one" aria-hidden="true" />
            <span className="voice-orb__ring voice-orb__ring--two" aria-hidden="true" />
            <span className="voice-orb__glow" aria-hidden="true" />
            <span className="voice-orb__core" ref={voiceOrbCoreRef} aria-hidden="true">
              <span className="voice-orb__liquid voice-orb__liquid--one" />
              <span className="voice-orb__liquid voice-orb__liquid--two" />
              <span className="voice-orb__highlight" />
            </span>
          </button>
          <span>{speaking ? "Speaking — tap to stop" : "Listen"}</span>
        </section>
        {activeOutputCard.visible && (
        <section
          className={`output-card ${isOutputCardLoading ? "loading" : ""}`}
          aria-live="polite"
          aria-busy={isOutputCardLoading}
        >
          <div className="output-label">
            <Sparkle weight="fill" /> VELO
          </div>
          {isOutputCardLoading ? (
            <div className="thinking">
              <span />
              <span />
              <span />
              <p>Thinking through your question…</p>
            </div>
          ) : (
            <div className="output-copy">
              <h1>{activeOutputCard.result.title}</h1>
              <p>{activeOutputCard.result.answer}</p>
              {activeOutputCard.result.nextStep && (
                <div className="next-step">
                  <CheckCircle weight="fill" />
                  <span>{activeOutputCard.result.nextStep}</span>
                </div>
              )}
              {activeOutputCard.result.motionforge && (
                <div className="motionforge-note">
                  <Waveform weight="duotone" />
                  <span>MotionForge scene prepared</span>
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {viewingEarlierTutorTurn && selectedTutorTurn && (
          <TurnReview turn={selectedTutorTurn} onReturn={() => { window.speechSynthesis?.cancel(); setTutorTurnIndex(latestTutorTurnIndex); }} />
        )}
        {mode === "explain" && explanation && !viewingEarlierTutorTurn && (
          <ExplainResponse
            explanation={explanation}
            learnerLevel={learnerLevel}
            setLearnerLevel={setLearnerLevel}
            onSpeak={explainSpeech}
            speechState={speechState}
            ttsEnabled={BROWSER_TTS_ENABLED}
            onVisualize={() => {
              setMode("visualize");
            }}
          />
        )}
        {mode === "guide" && guideSession && !viewingEarlierTutorTurn && (
          <GuidePanel
            session={guideSession}
            onAction={guideAction}
            onStartOver={startGuideOver}
          />
        )}
        {mode === "interactive" && (interactive || interactiveError) && (
          <section className="interactive-result">
            <div className="visualizations-heading">
              <Atom weight="duotone" />
              <div>
                <strong>Interactive simulation</strong>
                <span>
                  {interactiveTimeline
                    ? "Ready to explore"
                    : interactive?.stage || "Unavailable"}
                </span>
              </div>
            </div>
            {interactiveError && (
              <p className="visualizations-error">{interactiveError}</p>
            )}
            {interactiveTimeline ? (
              <>
                <InteractivePanel
                  timeline={interactiveTimeline}
                  onParameters={updateInteractive}
                />
                <div className="interactive-export">
                  <button onClick={exportInteractive}>Export MP4</button>
                  {interactiveExport && <span>{interactiveExport}</span>}
                </div>
              </>
            ) : (
              !interactiveError && (
                <div className="timeline-pending">
                  <SpinnerGap className="spin" weight="bold" /> Building
                  timeline…
                </div>
              )
            )}
          </section>
        )}
        {mode === "visualize" && (latestAnimation || animationError) && (
          <section className="visualizations" aria-label="Saved visualizations">
            <div className="visualizations-heading">
              <FilmSlate weight="duotone" />
              <div>
                <strong>Latest visualization</strong>
                <span>Saved on this device</span>
              </div>
              {historyJobs.length > 0 && (
                <button
                  type="button"
                  className="visualization-history-button"
                  onClick={() => setHistoryOpen(true)}
                >
                  History ({historyJobs.length})
                </button>
              )}
            </div>
            {animationError && (
              <p className="visualizations-error">{animationError}</p>
            )}
            {latestAnimation?.status === "complete" ? (
              <div className="latest-visualization">
                <p>{latestAnimation.prompt}</p>
                <video
                  controls
                  autoPlay
                  muted
                  playsInline
                  src={latestAnimation.videoUrl}
                >
                  Your browser does not support MP4 video.
                </video>
                <button
                  type="button"
                  className="latest-details"
                  onClick={(event) => openAnimation(latestAnimation, event)}
                >
                  Open details
                </button>
              </div>
            ) : (
              latestAnimation && (
                <AnimationCard
                  job={latestAnimation}
                  onOpen={openAnimation}
                  onCancel={cancelAnimation}
                />
              )
            )}
          </section>
        )}

        <div className="starter-row" aria-label="Suggested prompts">
          {starters.map((starter) => (
            <button key={starter} onClick={() => useStarter(starter)}>
              {starter}
            </button>
          ))}
        </div>
        {["explain", "guide"].includes(mode) && selectedTutorTurn && (
          <section className="active-turn-card" aria-label="Current tutor prompt">
            <button type="button" className="active-turn-copy" onClick={() => setTutorHistoryOpen(true)}>
              <span>You asked · {(tutorTurnIndex ?? latestTutorTurnIndex) + 1} of {tutorTurns.length}</span>
              <strong>{selectedTutorTurn.prompt}</strong>
            </button>
            <div className="active-turn-navigation">
              <button type="button" disabled={(tutorTurnIndex ?? latestTutorTurnIndex) === 0} onClick={() => { window.speechSynthesis?.cancel(); setTutorTurnIndex((index) => Math.max(0, (index ?? latestTutorTurnIndex) - 1)); }} aria-label="Previous prompt"><ArrowUp weight="bold" /></button>
              <button type="button" disabled={(tutorTurnIndex ?? latestTutorTurnIndex) >= latestTutorTurnIndex} onClick={() => { window.speechSynthesis?.cancel(); setTutorTurnIndex((index) => Math.min(latestTutorTurnIndex, (index ?? latestTutorTurnIndex) + 1)); }} aria-label="Next prompt"><ArrowDown weight="bold" /></button>
            </div>
          </section>
        )}
        <form className="prompt-form" onSubmit={submit}>
          <label htmlFor="physics-prompt">Ask Velo</label>
          <div className="prompt-field">
            <textarea
              id="physics-prompt"
              aria-label="Ask Velo"
              ref={inputRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a physics question…"
              rows="1"
            />
            <div className="composer-toolbar">
              <span
                className="composer-disabled-control"
                data-tooltip="Attachments are coming in the next version"
              >
                <button type="button" disabled aria-label="Attachments coming soon">
                  <Plus weight="bold" />
                </button>
              </span>
              <span className="composer-model" title={composerModelLabel}>
                {composerModelLabel}
              </span>
              <span
                className="composer-disabled-control"
                data-tooltip="Voice input is coming in the next version"
              >
                <button type="button" disabled aria-label="Voice input coming soon">
                  <Microphone weight="bold" />
                </button>
              </span>
              <button
                className="prompt-send"
                type="submit"
                disabled={!prompt.trim() || loading}
                aria-label="Send question"
              >
                <PaperPlaneTilt weight="fill" />
              </button>
            </div>
          </div>
          <span>Press Enter to send · Shift + Enter for a new line</span>
        </form>
      </div>
      <WorkspaceDrawer
        open={workspaceDrawerOpen}
        onClose={() => setWorkspaceDrawerOpen(false)}
        groups={workspaceGroups}
        activeIds={activeWorkspaceIds}
        onOpen={openWorkspace}
        onNew={newWorkspace}
        onDelete={deleteWorkspace}
      />
      {tutorHistoryOpen && (
        <div className="turn-history-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTutorHistoryOpen(false); }}>
          <section className="turn-history-dialog" role="dialog" aria-modal="true" aria-labelledby="turn-history-title">
            <button className="dialog-close" type="button" onClick={() => setTutorHistoryOpen(false)} aria-label="Close chat history">&times;</button>
            <p className="dialog-kicker">This chat</p>
            <h2 id="turn-history-title">Previous prompts</h2>
            <ol>
              {tutorTurns.map((turn, index) => <li key={turn.id}><button type="button" className={index === (tutorTurnIndex ?? latestTutorTurnIndex) ? "active" : ""} onClick={() => { window.speechSynthesis?.cancel(); setTutorTurnIndex(index); setTutorHistoryOpen(false); }}><span>{index + 1}</span><strong>{turn.prompt}</strong><small>{turn.mode === "guide" ? "Guide" : "Explain"}</small></button></li>)}
            </ol>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="visualization-overlay">
          <section
            className="visualization-dialog settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <button
              className="dialog-close"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              ×
            </button>
            <p className="dialog-kicker">Providers</p>
            <h2 id="settings-title">Settings</h2>
            {["base", "interactive", "visualize"].map((kind) => (
              <fieldset key={kind}>
                <legend>
                  {kind === "base"
                    ? "Base mode — Explain and Guide"
                    : `${kind[0].toUpperCase()}${kind.slice(1)} mode`}
                </legend>
                <ProviderSelect value={settings[kind].provider} options={availableProviders.filter((provider) => kind === "base" ? provider.supportsBaseTutor : provider.supportsMotionForge)} onChange={(provider) => setSettings((current) => ({ ...current, [kind]: { provider, model: "" } }))} />
                <input
                  value={settings[kind].model}
                  placeholder="Model name"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [kind]: { ...current[kind], model: event.target.value },
                    }))
                  }
                />
                {["openai", "anthropic"].includes(settings[kind].provider) && (credentialStorage.available ? <><input id={`${kind}-api-key`} type="password" autoComplete="off" placeholder="API key (stored securely)" /><button type="button" onClick={() => saveApiKey(kind)}>Save API key</button></> : <p className="settings-status error"><i />{credentialStorage.reason || "Secure credential storage is unavailable."}</p>)}
                <div className="settings-test-row"><button type="button" onClick={() => testProvider(kind)} disabled={providerStatus[kind]?.pending || !effectiveSelection(kind).provider}>{providerStatus[kind]?.pending ? "Testing…" : "Test connection"}</button>{providerStatus[kind]?.message && <p className={providerStatus[kind].saved ? "settings-status saved" : providerStatus[kind].ok ? "settings-status ok" : "settings-status error"}><i />{providerStatus[kind].saved ? "API key saved" : providerStatus[kind].ok ? "Connected" : "Unable to connect"}</p>}</div>
              </fieldset>
            ))}
            <button className="settings-save" onClick={saveSettings}>
              Save settings
            </button>
          </section>
        </div>
      )}
      {historyOpen && (
        <div
          className="visualization-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <section
            className="visualization-dialog history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            tabIndex="-1"
          >
            <button
              className="dialog-close"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close visualization history"
            >
              ×
            </button>
            <p className="dialog-kicker">Visualizations</p>
            <h2 id="history-title">History</h2>
            <div className="history-list">
              {historyJobs.map((job) => (
                <AnimationCard
                  key={job.id}
                  job={job}
                  onOpen={(item, event) => {
                    setHistoryOpen(false);
                    openAnimation(item, event);
                  }}
                  onCancel={cancelAnimation}
                />
              ))}
            </div>
          </section>
        </div>
      )}
      {selectedAnimation && (
        <div
          className="visualization-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedAnimationId(null);
          }}
        >
          <section
            className="visualization-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="visualization-title"
            tabIndex="-1"
          >
            <button
              className="dialog-close"
              onClick={() => setSelectedAnimationId(null)}
              aria-label="Close visualization"
            >
              ×
            </button>
            <p className="dialog-kicker">Visualization</p>
            <h2 id="visualization-title">
              {selectedAnimation.status === "complete"
                ? "Your animation"
                : selectedAnimation.stage}
            </h2>
            <p className="dialog-prompt">
              {selectedAnimation.prompt ||
                "This visualization was created before prompt history was enabled."}
            </p>
            {selectedAnimation.status === "complete" && (
              <video
                controls
                autoPlay
                muted
                playsInline
                src={selectedAnimation.videoUrl}
              >
                Your browser does not support MP4 video.
              </video>
            )}
            {selectedAnimation.status === "failed" && (
              <p className="dialog-error">
                {selectedAnimation.error?.message ||
                  "The animation could not be completed."}
                {selectedAnimation.error?.code && (
                  <span>
                    <br />
                    {selectedAnimation.error.code}
                  </span>
                )}
                {Array.isArray(selectedAnimation.error?.details) &&
                  selectedAnimation.error.details.map((detail, index) => (
                    <span key={`${detail.path || "error"}-${index}`}>
                      <br />
                      {detail.path ? `${detail.path}: ` : ""}
                      {detail.message || String(detail)}
                    </span>
                  ))}
              </p>
            )}
            {selectedAnimation.status === "cancelled" && (
              <p className="dialog-error">
                {selectedAnimation.error?.message ||
                  "The animation was cancelled."}
              </p>
            )}
            <p className="dialog-time">
              Created {displayTime(selectedAnimation.createdAt)}
            </p>
            <div className="dialog-actions">
              {["queued", "running"].includes(selectedAnimation.status) && (
                <button onClick={() => cancelAnimation(selectedAnimation.id)}>
                  Cancel
                </button>
              )}
              {["failed", "cancelled"].includes(selectedAnimation.status) &&
                selectedAnimation.prompt && (
                  <button
                    onClick={() => generateAnimation(selectedAnimation.prompt)}
                  >
                    Retry
                  </button>
                )}
              {!["queued", "running"].includes(selectedAnimation.status) && (
                <button
                  className="danger"
                  onClick={() => deleteAnimation(selectedAnimation.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("velo-theme") || "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("velo-theme", theme);
  }, [theme]);
  const toggleTheme = () =>
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  return started ? (
    <Tutor
      onBack={() => setStarted(false)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  ) : (
    <Home
      onStart={() => setStarted(true)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}
