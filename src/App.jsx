import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  CheckCircle,
  Compass,
  FilmSlate,
  Lightbulb,
  PaperPlaneTilt,
  Pause,
  SpeakerHigh,
  Sparkle,
  SpinnerGap,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";

const modes = [
  { id: "explain", label: "Explain", icon: Lightbulb },
  { id: "guide", label: "Guide", icon: Compass },
  { id: "visualize", label: "Visualize", icon: Waveform },
];

const starters = [
  "Why do satellites stay in orbit?",
  "Explain projectile motion simply",
  "Guide me through conservation of energy",
];

function Home({ onStart }) {
  return (
    <main className="home-screen">
      <nav className="home-nav" aria-label="Welcome navigation">
        <a className="brand" href="#top" aria-label="Velo home">
          <span className="brand-icon"><Atom weight="duotone" /></span>
          <span>Velo</span>
        </a>
        <button className="nav-start" onClick={onStart}>Open tutor <ArrowRight weight="bold" /></button>
      </nav>

      <section className="hero" id="top">
        <div className="hero-kicker"><Sparkle weight="fill" /> A quieter way to understand physics</div>
        <h1>Physics,<br /><span>made clear.</span></h1>
        <p>Ask a question. Explore it from every angle. Hear the explanation when reading isn’t enough.</p>
        <button className="primary-cta" onClick={onStart}>Get started <ArrowRight weight="bold" /></button>
        <p className="no-login">No account. No setup. Just start asking.</p>
      </section>

      <section className="feature-row" aria-label="Product features">
        <article><Lightbulb weight="duotone" /><div><strong>Understand</strong><span>Clear explanations, at your pace.</span></div></article>
        <article><Compass weight="duotone" /><div><strong>Discover</strong><span>Guided questions that build intuition.</span></div></article>
        <article><SpeakerHigh weight="duotone" /><div><strong>Listen</strong><span>Natural text-to-speech built in.</span></div></article>
      </section>
    </main>
  );
}

function Tutor({ onBack }) {
  const [mode, setMode] = useState("explain");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [animation, setAnimation] = useState(null);
  const [result, setResult] = useState({
    title: "Ask anything about physics",
    answer: "Choose how you want to learn, then send a question. Velo can explain the idea, guide you with one step at a time, or prepare a visual model.",
    nextStep: "Try one of the prompts below, or write your own.",
  });
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/health").then((response) => setBackendOnline(response.ok)).catch(() => setBackendOnline(false));
    return () => window.speechSynthesis?.cancel();
  }, []);

  async function generateAnimation(question) {
    try {
      setAnimation({ status: "queued", stage: "Sending prompt to MotionForge…" });
      const startResponse = await fetch("/api/animations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: question }),
      });
      const startedJob = await startResponse.json();
      if (!startResponse.ok) throw new Error(startedJob.error || "MotionForge could not start.");
      setAnimation(startedJob);

      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const statusResponse = await fetch(`/api/animations/${startedJob.id}`);
        const job = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(job.error || "Animation status could not be read.");
        setAnimation(job);
        if (job.status === "complete" || job.status === "failed") break;
      }
    } catch (error) {
      setAnimation({ status: "failed", stage: "Animation failed", error: error.message });
    }
  }

  async function submit(event) {
    event?.preventDefault();
    const question = prompt.trim();
    if (!question || loading) return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(true);
    if (mode === "visualize") void generateAnimation(question);
    else setAnimation(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: question, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Velo could not answer that yet.");
      setResult(data);
      setBackendOnline(true);
    } catch (error) {
      setResult({ title: "Connection interrupted", answer: error.message, nextStep: "Make sure the local backend is running, then try again." });
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }

  function speak() {
    if (!("speechSynthesis" in window) || loading) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(`${result.title}. ${result.answer}. ${result.nextStep || ""}`);
    speech.rate = 0.94;
    speech.pitch = 1;
    speech.onstart = () => setSpeaking(true);
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(speech);
  }

  function useStarter(text) {
    setPrompt(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <main className="tutor-screen">
      <header className="tutor-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to welcome"><ArrowLeft weight="bold" /></button>
        <a className="brand compact" href="#" onClick={(event) => { event.preventDefault(); onBack(); }}>
          <span className="brand-icon"><Atom weight="duotone" /></span><span>Velo</span>
        </a>
        <div className={`backend-state ${backendOnline ? "online" : "offline"}`}><span />{backendOnline ? "Local backend" : "Reconnecting"}</div>
      </header>

      <div className="tutor-body">
        <section className="mode-section" aria-labelledby="mode-label">
          <p id="mode-label">How would you like to learn?</p>
          <div className="mode-switcher">
            {modes.map(({ id, label, icon: Icon }) => (
              <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)} aria-pressed={mode === id}>
                <Icon weight={mode === id ? "fill" : "regular"} />{label}
              </button>
            ))}
          </div>
        </section>

        <section className="voice-section">
          <button className={`voice-button ${speaking ? "speaking" : ""}`} onClick={speak} aria-label={speaking ? "Stop speaking" : "Read response aloud"}>
            {speaking ? <Pause weight="fill" /> : <SpeakerHigh weight="fill" />}
          </button>
          <span>{speaking ? "Speaking" : "Listen"}</span>
        </section>

        <section className={`output-card ${loading ? "loading" : ""}`} aria-live="polite" aria-busy={loading}>
          <div className="output-label"><Sparkle weight="fill" /> VELO</div>
          {loading ? (
            <div className="thinking"><span /><span /><span /><p>Thinking through your question…</p></div>
          ) : (
            <div className="output-copy">
              <h1>{result.title}</h1>
              <p>{result.answer}</p>
              {result.nextStep && <div className="next-step"><CheckCircle weight="fill" /><span>{result.nextStep}</span></div>}
              {result.motionforge && <div className="motionforge-note"><Waveform weight="duotone" /><span>MotionForge scene prepared</span></div>}
            </div>
          )}
        </section>

        {animation && (
          <section className={`animation-card ${animation.status}`} aria-live="polite">
            {animation.status === "complete" ? (
              <>
                <div className="animation-heading"><FilmSlate weight="duotone" /><div><strong>Your animation</strong><span>Generated by MotionForge</span></div></div>
                <video key={animation.videoUrl} controls autoPlay muted playsInline src={animation.videoUrl}>Your browser does not support MP4 video.</video>
              </>
            ) : animation.status === "failed" ? (
              <div className="animation-status error"><WarningCircle weight="duotone" /><div><strong>Couldn’t create the animation</strong><span>{animation.error || "MotionForge stopped unexpectedly."}</span></div></div>
            ) : (
              <div className="animation-status"><SpinnerGap className="spin" weight="bold" /><div><strong>{animation.stage || "Generating animation…"}</strong><span>Cloud Ollama is designing the scene, then MotionForge will simulate and render it.</span></div></div>
            )}
          </section>
        )}

        <div className="starter-row" aria-label="Suggested prompts">
          {starters.map((starter) => <button key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}
        </div>

        <form className="prompt-form" onSubmit={submit}>
          <label htmlFor="physics-prompt">Ask Velo</label>
          <div className="prompt-field">
            <textarea id="physics-prompt" ref={inputRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
            }} placeholder="Ask a physics question…" rows="1" />
            <button type="submit" disabled={!prompt.trim() || loading} aria-label="Send question"><PaperPlaneTilt weight="fill" /></button>
          </div>
          <span>Press Enter to send · Shift + Enter for a new line</span>
        </form>
      </div>
    </main>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  return started ? <Tutor onBack={() => setStarted(false)} /> : <Home onStart={() => setStarted(true)} />;
}
