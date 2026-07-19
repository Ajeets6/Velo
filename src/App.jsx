import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  CheckCircle,
  Compass,
  FilmSlate,
  GearSix,
  Lightbulb,
  Moon,
  PaperPlaneTilt,
  Pause,
  SpeakerHigh,
  Sparkle,
  SpinnerGap,
  Sun,
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
}) {
  if (!explanation) return null;
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
            Current level
          </button>
          <button
            onClick={() => setLearnerLevel("technical")}
            className={learnerLevel === "technical" ? "active" : ""}
          >
            More technical
          </button>
        </div>
        <div className="speech-controls">
          <button onClick={() => onSpeak("all")}>
            {speechState.status === "speaking"
              ? "Pause"
              : speechState.status === "paused"
                ? "Resume"
                : "Listen"}
          </button>
          <button onClick={() => onSpeak("restart")}>Restart</button>
          <select
            value={speechState.rate}
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
      {explanation.summary && (
        <p className="explain-summary">{explanation.summary}</p>
      )}
      <PhysicsDiagram type={explanation.visualSuggestion} />
      {explanation.sections.map((section, index) => (
        <article
          className={`explain-section ${section.kind}`}
          key={`${section.kind}-${index}`}
        >
          <div>
            <span>{section.kind}</span>
            {section.kind === "equation" && (
              <p className="equation" aria-label={section.spokenText}>
                {section.latex}
              </p>
            )}
            {section.text && <p>{section.text}</p>}
          </div>
          <button
            className="section-listen"
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
      {explanation.checkQuestion && (
        <div className="explain-check">
          <strong>Check your understanding</strong>
          <p>{explanation.checkQuestion}</p>
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
  const [speaking, setSpeaking] = useState(false);
  const [speechState, setSpeechState] = useState({ status: "idle", rate: 1 });
  const [learnerLevel, setLearnerLevel] = useState("current");
  const [explanation, setExplanation] = useState(null);
  const [explainSessionId, setExplainSessionId] = useState(
    () => sessionStorage.getItem("velo-explain-session") || "",
  );
  const [guideSession, setGuideSession] = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [animationJobs, setAnimationJobs] = useState([]);
  const [selectedAnimationId, setSelectedAnimationId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [animationError, setAnimationError] = useState("");
  const [interactive, setInteractive] = useState(null);
  const [interactiveTimeline, setInteractiveTimeline] = useState(null);
  const [interactiveError, setInteractiveError] = useState("");
  const [interactiveExport, setInteractiveExport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() =>
    JSON.parse(
      localStorage.getItem("velo-provider-settings") ||
        '{"base":{"provider":"local","model":""},"interactive":{"provider":"","model":""},"visualize":{"provider":"","model":""}}',
    ),
  );
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const cardTriggerRef = useRef(null);
  const utteranceRef = useRef(null);
  const [result, setResult] = useState({
    title: "Ask anything about physics",
    answer:
      "Choose how you want to learn, then send a question. Velo can explain the idea, guide you with one step at a time, or prepare a visual model.",
    nextStep: "Try one of the prompts below, or write your own.",
  });
  const isVisualizationAvailable = (kind) =>
    settings[kind]?.provider && settings[kind]?.model;
  const saveSettings = () => {
    localStorage.setItem("velo-provider-settings", JSON.stringify(settings));
    setSettingsOpen(false);
  };

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
    fetch("/api/health")
      .then((response) => setBackendOnline(response.ok))
      .catch(() => setBackendOnline(false));
    void refreshAnimations();
    const timer = window.setInterval(refreshAnimations, 1200);
    return () => {
      window.clearInterval(timer);
      window.speechSynthesis?.cancel();
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
        body: JSON.stringify({ prompt: question }),
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
        body: JSON.stringify({ prompt: question, preferTemplate: true, ...settings.interactive }),
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
  async function streamExplain(question, level = learnerLevel) {
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
        learnerLevel: level,
        sessionId: explainSessionId || undefined,
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
  }
  function explainSpeech(action, text) {
    if (!("speechSynthesis" in window)) return;
    if (action === "rate") {
      setSpeechState((state) => ({ ...state, rate: text }));
      return;
    }
    if (action === "restart") {
      window.speechSynthesis.cancel();
      setSpeechState((state) => ({ ...state, status: "idle" }));
      if (explanation?.spokenText) setTimeout(() => explainSpeech("all"), 0);
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
      body: JSON.stringify({ prompt: question, learnerLevel }),
    });
    const session = await response.json();
    if (!response.ok)
      throw new Error(
        session.error?.message || "Velo could not start this guide.",
      );
    setGuideSession(session);
    setPrompt("");
  }
  async function guideAction(action) {
    if (!guideSession) return;
    try {
      const response = await fetch(
        `/api/guide/sessions/${guideSession.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            answer: action === "answer" ? prompt.trim() : "",
          }),
        },
      );
      const session = await response.json();
      if (!response.ok)
        throw new Error(
          session.error?.message || "The guide could not continue.",
        );
      setGuideSession(session);
      if (action === "visual") {
        setMode("visualize");
        setPrompt(session.message?.visualPrompt || guideSession.prompt);
      } else if (action === "answer") setPrompt("");
    } catch (error) {
      setResult({
        title: "Guide interrupted",
        answer: error.message,
        nextStep: "Try again in a moment.",
      });
    }
  }
  async function startGuideOver() {
    if (!guideSession) return;
    await fetch(`/api/guide/sessions/${guideSession.id}`, { method: "DELETE" });
    setGuideSession(null);
  }
  function speak() {
    if (!("speechSynthesis" in window) || loading) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(
      `${result.title}. ${result.answer}. ${result.nextStep || ""}`,
    );
    speech.rate = 0.94;
    speech.pitch = 1;
    speech.onstart = () => setSpeaking(true);
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(speech);
  }
  async function submit(event) {
    event?.preventDefault();
    const question = prompt.trim();
    if (!question || loading) return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(true);
    if (mode === "visualize") void generateAnimation(question);
    if (mode === "interactive") void generateInteractive(question);
    try {
      if (mode === "explain") {
        await streamExplain(question);
        setBackendOnline(true);
      } else if (mode === "guide") {
        if (guideSession) await guideAction("answer");
        else await startGuide(question);
        setBackendOnline(true);
      } else if (mode === "interactive") {
        setBackendOnline(true);
      } else {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: question, mode }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message ||
              data.error ||
              "Velo could not answer that yet.",
          );
        setResult(data);
        setBackendOnline(true);
      }
    } catch (error) {
      setResult({
        title: "Connection interrupted",
        answer: error.message,
        nextStep: "Make sure the local backend is running, then try again.",
      });
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }

  const latestAnimation = animationJobs[0] || null;
  const historyJobs = animationJobs.slice(1);
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
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="Back to welcome"
        >
          <ArrowLeft weight="bold" />
        </button>
        <a
          className="brand compact"
          href="#"
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
          <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Provider settings"><GearSix weight="bold" /></button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div
            className={`backend-state ${backendOnline ? "online" : "offline"}`}
          >
            <span />
            {backendOnline ? "Local backend" : "Reconnecting"}
          </div>
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
                disabled={["visualize", "interactive"].includes(id) && !isVisualizationAvailable(id)}
                title={["visualize", "interactive"].includes(id) && !isVisualizationAvailable(id) ? "Configure a provider and model in Settings to enable this mode." : undefined}
              >
                <Icon weight={mode === id ? "fill" : "regular"} />
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="voice-section">
          <button
            className={`voice-button ${speaking ? "speaking" : ""}`}
            onClick={speak}
            aria-label={speaking ? "Stop speaking" : "Read response aloud"}
          >
            {speaking ? <Pause weight="fill" /> : <SpeakerHigh weight="fill" />}
          </button>
          <span>{speaking ? "Speaking" : "Listen"}</span>
        </section>
        <section
          className={`output-card ${loading ? "loading" : ""}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <div className="output-label">
            <Sparkle weight="fill" /> VELO
          </div>
          {loading ? (
            <div className="thinking">
              <span />
              <span />
              <span />
              <p>Thinking through your question…</p>
            </div>
          ) : (
            <div className="output-copy">
              <h1>{result.title}</h1>
              <p>{result.answer}</p>
              {result.nextStep && (
                <div className="next-step">
                  <CheckCircle weight="fill" />
                  <span>{result.nextStep}</span>
                </div>
              )}
              {result.motionforge && (
                <div className="motionforge-note">
                  <Waveform weight="duotone" />
                  <span>MotionForge scene prepared</span>
                </div>
              )}
            </div>
          )}
        </section>

        {mode === "explain" && explanation && (
          <ExplainResponse
            explanation={explanation}
            learnerLevel={learnerLevel}
            setLearnerLevel={(level) => {
              setLearnerLevel(level);
              if (prompt.trim()) void streamExplain(prompt.trim(), level);
            }}
            onSpeak={explainSpeech}
            speechState={speechState}
            onVisualize={() => {
              setMode("visualize");
            }}
          />
        )}
        {mode === "guide" && guideSession && (
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
        <form className="prompt-form" onSubmit={submit}>
          <label htmlFor="physics-prompt">Ask Velo</label>
          <div className="prompt-field">
            <textarea
              id="physics-prompt"
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
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              aria-label="Send question"
            >
              <PaperPlaneTilt weight="fill" />
            </button>
          </div>
          <span>Press Enter to send · Shift + Enter for a new line</span>
        </form>
      </div>
      {settingsOpen && <div className="visualization-overlay"><section className="visualization-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="dialog-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button><p className="dialog-kicker">Providers</p><h2 id="settings-title">Settings</h2>{["base", "interactive", "visualize"].map((kind) => <fieldset key={kind}><legend>{kind === "base" ? "Base mode — Explain and Guide" : `${kind[0].toUpperCase()}${kind.slice(1)} mode`}</legend><select value={settings[kind].provider} onChange={(event) => setSettings((current) => ({ ...current, [kind]: { ...current[kind], provider: event.target.value } }))}><option value="">Not configured</option>{kind === "base" && <option value="local">Local</option>}<option value="ollama">Ollama</option><option value="anthropic">Anthropic</option></select><input value={settings[kind].model} placeholder="Model name" onChange={(event) => setSettings((current) => ({ ...current, [kind]: { ...current[kind], model: event.target.value } }))} /></fieldset>)}<button className="settings-save" onClick={saveSettings}>Save settings</button></section></div>}
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
