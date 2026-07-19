import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Atom, CheckCircle, Compass, FilmSlate, Lightbulb, Moon, PaperPlaneTilt, Pause, SpeakerHigh, Sparkle, SpinnerGap, Sun, WarningCircle, Waveform } from "@phosphor-icons/react";

const modes = [
  { id: "explain", label: "Explain", icon: Lightbulb },
  { id: "guide", label: "Guide", icon: Compass },
  { id: "visualize", label: "Visualize", icon: Waveform },
];
const starters = ["Why do satellites stay in orbit?", "Explain projectile motion simply", "Guide me through conservation of energy"];

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return <button className="theme-toggle" onClick={onToggle} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>{isDark ? <Sun weight="fill" /> : <Moon weight="fill" />}</button>;
}

function Home({ onStart, theme, onToggleTheme }) {
  return <main className="home-screen"><nav className="home-nav" aria-label="Welcome navigation"><a className="brand" href="#top" aria-label="Velo home"><span className="brand-icon"><Atom weight="duotone" /></span><span>Velo</span></a><div className="home-actions"><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button className="nav-start" onClick={onStart}>Open tutor <ArrowRight weight="bold" /></button></div></nav><section className="hero" id="top"><div className="hero-kicker"><Sparkle weight="fill" /> A quieter way to understand physics</div><h1>Physics,<br /><span>made clear.</span></h1><p>Ask a question. Explore it from every angle. Hear the explanation when reading isn’t enough.</p><button className="primary-cta" onClick={onStart}>Get started <ArrowRight weight="bold" /></button><p className="no-login">No account. No setup. Just start asking.</p></section><section className="feature-row" aria-label="Product features"><article><Lightbulb weight="duotone" /><div><strong>Understand</strong><span>Clear explanations, at your pace.</span></div></article><article><Compass weight="duotone" /><div><strong>Discover</strong><span>Guided questions that build intuition.</span></div></article><article><SpeakerHigh weight="duotone" /><div><strong>Listen</strong><span>Natural text-to-speech built in.</span></div></article></section></main>;
}

function AnimationCard({ job, onOpen, onCancel }) {
  const active = ["queued", "running"].includes(job.status);
  const label = job.status === "complete" ? "Ready" : job.status === "cancelled" ? "Cancelled" : job.status === "failed" ? "Failed" : job.stage;
  return <article className={`visualization-card ${job.status}`}><button type="button" className="visualization-card-open" onClick={(event) => onOpen(job, event)}><span className="visualization-card-status">{active ? <SpinnerGap className="spin" weight="bold" /> : job.status === "complete" ? <FilmSlate weight="fill" /> : <WarningCircle weight="fill" />}</span><span className="visualization-card-copy"><strong>{job.prompt || "Earlier visualization"}</strong><span>{job.queuePosition ? `Queue position ${job.queuePosition}` : label}</span></span></button>{active && <button type="button" className="visualization-card-cancel" onClick={() => onCancel(job.id)}>Cancel</button>}</article>;
}

function Tutor({ onBack, theme, onToggleTheme }) {
  const [mode, setMode] = useState("explain");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [animationJobs, setAnimationJobs] = useState([]);
  const [selectedAnimationId, setSelectedAnimationId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [animationError, setAnimationError] = useState("");
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const cardTriggerRef = useRef(null);
  const [result, setResult] = useState({ title: "Ask anything about physics", answer: "Choose how you want to learn, then send a question. Velo can explain the idea, guide you with one step at a time, or prepare a visual model.", nextStep: "Try one of the prompts below, or write your own." });

  async function refreshAnimations() {
    try { const response = await fetch("/api/animations?limit=50"); const data = await response.json(); if (response.ok) { setAnimationJobs(data.jobs); setAnimationError(""); } } catch { /* Keep saved cards visible while reconnecting. */ }
  }

  useEffect(() => {
    fetch("/api/health").then((response) => setBackendOnline(response.ok)).catch(() => setBackendOnline(false));
    void refreshAnimations();
    const timer = window.setInterval(refreshAnimations, 1200);
    return () => { window.clearInterval(timer); window.speechSynthesis?.cancel(); };
  }, []);

  const selectedAnimation = animationJobs.find((job) => job.id === selectedAnimationId) || null;
  useEffect(() => {
    if (!selectedAnimation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelectedAnimationId(null);
      if (event.key === "Tab" && dialogRef.current) {
        const controls = dialogRef.current.querySelectorAll("button, video[controls]");
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); cardTriggerRef.current?.focus(); };
  }, [selectedAnimationId]);

  async function generateAnimation(question) {
    try {
      const response = await fetch("/api/animations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: question }) });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error?.message || "MotionForge could not start.");
      setAnimationJobs((jobs) => [job, ...jobs.filter((item) => item.id !== job.id)]);
      void refreshAnimations();
    } catch (error) { setAnimationError(error.message); }
  }

  async function cancelAnimation(id) {
    try { const response = await fetch(`/api/animations/${id}/cancel`, { method: "POST" }); const job = await response.json(); if (!response.ok) throw new Error(job.error?.message || "The animation could not be cancelled."); setAnimationJobs((jobs) => jobs.map((item) => item.id === id ? job : item)); } catch (error) { setAnimationError(error.message); }
  }
  async function deleteAnimation(id) {
    if (!window.confirm("Delete this visualization and its saved video?")) return;
    try { const response = await fetch(`/api/animations/${id}`, { method: "DELETE" }); if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message || "The visualization could not be deleted."); } setAnimationJobs((jobs) => jobs.filter((job) => job.id !== id)); setSelectedAnimationId(null); } catch (error) { setAnimationError(error.message); }
  }
  function openAnimation(job, event) { cardTriggerRef.current = event.currentTarget; setSelectedAnimationId(job.id); }
  function useStarter(text) { setPrompt(text); requestAnimationFrame(() => inputRef.current?.focus()); }
  function speak() {
    if (!("speechSynthesis" in window) || loading) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const speech = new SpeechSynthesisUtterance(`${result.title}. ${result.answer}. ${result.nextStep || ""}`);
    speech.rate = 0.94; speech.pitch = 1; speech.onstart = () => setSpeaking(true); speech.onend = () => setSpeaking(false); speech.onerror = () => setSpeaking(false); window.speechSynthesis.speak(speech);
  }
  async function submit(event) {
    event?.preventDefault(); const question = prompt.trim(); if (!question || loading) return;
    window.speechSynthesis?.cancel(); setSpeaking(false); setLoading(true);
    if (mode === "visualize") void generateAnimation(question);
    try { const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: question, mode }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || data.error || "Velo could not answer that yet."); setResult(data); setBackendOnline(true); } catch (error) { setResult({ title: "Connection interrupted", answer: error.message, nextStep: "Make sure the local backend is running, then try again." }); setBackendOnline(false); } finally { setLoading(false); }
  }

  const latestAnimation = animationJobs[0] || null;
  const historyJobs = animationJobs.slice(1);
  const displayTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

  return <main className="tutor-screen"><header className="tutor-header"><button className="icon-button" onClick={onBack} aria-label="Back to welcome"><ArrowLeft weight="bold" /></button><a className="brand compact" href="#" onClick={(event) => { event.preventDefault(); onBack(); }}><span className="brand-icon"><Atom weight="duotone" /></span><span>Velo</span></a><div className="header-actions"><ThemeToggle theme={theme} onToggle={onToggleTheme} /><div className={`backend-state ${backendOnline ? "online" : "offline"}`}><span />{backendOnline ? "Local backend" : "Reconnecting"}</div></div></header><div className="tutor-body"><section className="mode-section" aria-labelledby="mode-label"><p id="mode-label">How would you like to learn?</p><div className="mode-switcher">{modes.map(({ id, label, icon: Icon }) => <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)} aria-pressed={mode === id}><Icon weight={mode === id ? "fill" : "regular"} />{label}</button>)}</div></section><section className="voice-section"><button className={`voice-button ${speaking ? "speaking" : ""}`} onClick={speak} aria-label={speaking ? "Stop speaking" : "Read response aloud"}>{speaking ? <Pause weight="fill" /> : <SpeakerHigh weight="fill" />}</button><span>{speaking ? "Speaking" : "Listen"}</span></section><section className={`output-card ${loading ? "loading" : ""}`} aria-live="polite" aria-busy={loading}><div className="output-label"><Sparkle weight="fill" /> VELO</div>{loading ? <div className="thinking"><span /><span /><span /><p>Thinking through your question…</p></div> : <div className="output-copy"><h1>{result.title}</h1><p>{result.answer}</p>{result.nextStep && <div className="next-step"><CheckCircle weight="fill" /><span>{result.nextStep}</span></div>}{result.motionforge && <div className="motionforge-note"><Waveform weight="duotone" /><span>MotionForge scene prepared</span></div>}</div>}</section>

    {(latestAnimation || animationError) && <section className="visualizations" aria-label="Saved visualizations"><div className="visualizations-heading"><FilmSlate weight="duotone" /><div><strong>Latest visualization</strong><span>Saved on this device</span></div>{historyJobs.length > 0 && <button type="button" className="visualization-history-button" onClick={() => setHistoryOpen(true)}>History ({historyJobs.length})</button>}</div>{animationError && <p className="visualizations-error">{animationError}</p>}{latestAnimation?.status === "complete" ? <div className="latest-visualization"><p>{latestAnimation.prompt}</p><video controls autoPlay muted playsInline src={latestAnimation.videoUrl}>Your browser does not support MP4 video.</video><button type="button" className="latest-details" onClick={(event) => openAnimation(latestAnimation, event)}>Open details</button></div> : latestAnimation && <AnimationCard job={latestAnimation} onOpen={openAnimation} onCancel={cancelAnimation} />}</section>}

    <div className="starter-row" aria-label="Suggested prompts">{starters.map((starter) => <button key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}</div><form className="prompt-form" onSubmit={submit}><label htmlFor="physics-prompt">Ask Velo</label><div className="prompt-field"><textarea id="physics-prompt" ref={inputRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Ask a physics question…" rows="1" /><button type="submit" disabled={!prompt.trim() || loading} aria-label="Send question"><PaperPlaneTilt weight="fill" /></button></div><span>Press Enter to send · Shift + Enter for a new line</span></form></div>
    {historyOpen && <div className="visualization-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><section className="visualization-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex="-1"><button className="dialog-close" onClick={() => setHistoryOpen(false)} aria-label="Close visualization history">×</button><p className="dialog-kicker">Visualizations</p><h2 id="history-title">History</h2><div className="history-list">{historyJobs.map((job) => <AnimationCard key={job.id} job={job} onOpen={(item, event) => { setHistoryOpen(false); openAnimation(item, event); }} onCancel={cancelAnimation} />)}</div></section></div>}
    {selectedAnimation && <div className="visualization-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAnimationId(null); }}><section className="visualization-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="visualization-title" tabIndex="-1"><button className="dialog-close" onClick={() => setSelectedAnimationId(null)} aria-label="Close visualization">×</button><p className="dialog-kicker">Visualization</p><h2 id="visualization-title">{selectedAnimation.status === "complete" ? "Your animation" : selectedAnimation.stage}</h2><p className="dialog-prompt">{selectedAnimation.prompt || "This visualization was created before prompt history was enabled."}</p>{selectedAnimation.status === "complete" && <video controls autoPlay muted playsInline src={selectedAnimation.videoUrl}>Your browser does not support MP4 video.</video>}{selectedAnimation.status === "failed" && <p className="dialog-error">{selectedAnimation.error?.message || "The animation could not be completed."}</p>}{selectedAnimation.status === "cancelled" && <p className="dialog-error">{selectedAnimation.error?.message || "The animation was cancelled."}</p>}<p className="dialog-time">Created {displayTime(selectedAnimation.createdAt)}</p><div className="dialog-actions">{["queued", "running"].includes(selectedAnimation.status) && <button onClick={() => cancelAnimation(selectedAnimation.id)}>Cancel</button>}{["failed", "cancelled"].includes(selectedAnimation.status) && selectedAnimation.prompt && <button onClick={() => generateAnimation(selectedAnimation.prompt)}>Retry</button>}{!["queued", "running"].includes(selectedAnimation.status) && <button className="danger" onClick={() => deleteAnimation(selectedAnimation.id)}>Delete</button>}</div></section></div>}</main>;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("velo-theme") || "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("velo-theme", theme); }, [theme]);
  const toggleTheme = () => setTheme((currentTheme) => currentTheme === "dark" ? "light" : "dark");
  return started ? <Tutor onBack={() => setStarted(false)} theme={theme} onToggleTheme={toggleTheme} /> : <Home onStart={() => setStarted(true)} theme={theme} onToggleTheme={toggleTheme} />;
}
