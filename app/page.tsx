"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Message = { role: "tutor" | "student"; text: string };

const guidedReplies = [
  "Good instinct. Before we calculate, what two independent motions make up the ball’s path?",
  "Exactly — horizontal motion is constant while gravity changes the vertical motion. What happens to the vertical velocity at the highest point?",
  "That’s the key moment. Vertical velocity is zero there, but horizontal velocity is still 12 m/s. Try raising the launch angle and watch how time in the air changes.",
];

function SpeakIcon() {
  return <span aria-hidden="true">◖))</span>;
}

export default function Home() {
  const [angle, setAngle] = useState(42);
  const [speed, setSpeed] = useState(18);
  const [playing, setPlaying] = useState(true);
  const [guideMode, setGuideMode] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(2);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "student", text: "Why does the ball keep moving forward while it falls?" },
    { role: "tutor", text: "Great question. Let’s separate the motion into two directions. What force acts on the ball after it leaves the launcher?" },
  ]);
  const [speaking, setSpeaking] = useState(false);
  const replyIndex = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setProgress((value) => (value >= 1 ? 0 : value + 0.006)), 24);
    return () => window.clearInterval(timer);
  }, [playing]);

  const trajectory = useMemo(() => {
    const radians = (angle * Math.PI) / 180;
    const range = Math.max(1, (speed * speed * Math.sin(2 * radians)) / 9.81);
    return Array.from({ length: 35 }, (_, index) => {
      const t = index / 34;
      const x = 8 + t * 84;
      const yNorm = (4 * t * (1 - t) * Math.tan(radians)) / 1.8;
      return { x, y: 83 - Math.min(62, yNorm * 48), range };
    });
  }, [angle, speed]);

  const ball = trajectory[Math.min(trajectory.length - 1, Math.floor(progress * trajectory.length))];
  const flightTime = (2 * speed * Math.sin((angle * Math.PI) / 180)) / 9.81;
  const range = (speed * speed * Math.sin((2 * angle * Math.PI) / 180)) / 9.81;
  const maxHeight = Math.pow(speed * Math.sin((angle * Math.PI) / 180), 2) / (2 * 9.81);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    const response = guideMode
      ? guidedReplies[replyIndex.current++ % guidedReplies.length]
      : "Gravity pulls the ball downward, but there is no horizontal force to remove its forward velocity. The two motions happen at the same time, producing a curved path.";
    setMessages((items) => [...items, { role: "student", text: question }, { role: "tutor", text: response }]);
    setInput("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Velo home"><span className="brand-mark">v</span><span>velo</span></a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#lesson">Learn</a>
          <a href="#topics">Topics</a>
          <a href="#progress">Progress</a>
        </nav>
        <div className="header-actions">
          <button className="streak" title="Learning streak">● <span>4 day streak</span></button>
          <button className="avatar" aria-label="Open profile">AK</button>
        </div>
      </header>

      <section className="lesson-header" id="lesson">
        <div>
          <div className="eyebrow"><span>MECHANICS</span><i /> LESSON 3 OF 8</div>
          <h1>Projectile motion</h1>
          <p>Explore how horizontal and vertical motion work together.</p>
        </div>
        <div className="lesson-progress" aria-label="Lesson progress">
          <span>Lesson progress</span><strong>38%</strong>
          <div><i /></div>
        </div>
      </section>

      <div className="workspace">
        <section className="lab-panel" aria-label="Interactive physics lab">
          <div className="panel-heading">
            <div><span className="live-dot" /> INTERACTIVE LAB</div>
            <button className="reset" onClick={() => { setAngle(42); setSpeed(18); setProgress(0); }}>↻ Reset</button>
          </div>

          <div className="scene" aria-label="Animated projectile trajectory">
            <div className="scene-grid" />
            <div className="cloud cloud-one" /><div className="cloud cloud-two" />
            <div className="ground"><span>launch point</span></div>
            <div className="launcher" style={{ transform: `rotate(${-angle}deg)` }} />
            {trajectory.filter((_, index) => index % 2 === 0).map((point, index) => (
              <i className="path-dot" key={index} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
            ))}
            <div className="ball" style={{ left: `${ball.x}%`, top: `${ball.y}%` }} />
            <div className="velocity-label" style={{ left: `${Math.min(82, ball.x + 3)}%`, top: `${Math.max(8, ball.y - 5)}%` }}>v = {speed} m/s</div>
            <div className="gravity-arrow"><b>↓</b><span>gravity</span></div>
            <div className="scene-stats">
              <span><small>TIME IN AIR</small><b>{flightTime.toFixed(1)} s</b></span>
              <span><small>MAX HEIGHT</small><b>{maxHeight.toFixed(1)} m</b></span>
              <span><small>RANGE</small><b>{range.toFixed(1)} m</b></span>
            </div>
          </div>

          <div className="playback">
            <button className="play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? "Ⅱ" : "▶"}</button>
            <input aria-label="Animation progress" type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
            <span>{(progress * flightTime).toFixed(1)}s / {flightTime.toFixed(1)}s</span>
            <button className="speed-button">1×</button>
          </div>

          <div className="controls">
            <label><span>Launch angle <b>{angle}°</b></span><input type="range" min="15" max="75" value={angle} onChange={(event) => { setAngle(Number(event.target.value)); setProgress(0); }} /></label>
            <label><span>Initial speed <b>{speed} m/s</b></span><input type="range" min="8" max="30" value={speed} onChange={(event) => { setSpeed(Number(event.target.value)); setProgress(0); }} /></label>
          </div>

          <article className="explanation-card">
            <div className="explanation-top">
              <span className="idea-icon">✦</span>
              <div><small>KEY IDEA</small><h2>Two motions, one path</h2></div>
              <button className={speaking ? "speaking" : ""} onClick={() => speak("Projectile motion combines two independent motions. Horizontally, the ball travels at constant speed. Vertically, gravity accelerates the ball downward. Together, these create a curved path.")}><SpeakIcon /> {speaking ? "Speaking…" : "Listen"}</button>
            </div>
            <p>Projectile motion combines two independent motions. Horizontally, the ball travels at a constant speed. Vertically, gravity accelerates it downward. Together, they create the curved path.</p>
            <div className="formula"><span>x = v₀ cos(θ) · t</span><i>+</i><span>y = v₀ sin(θ) · t − ½gt²</span></div>
          </article>

          <div className="steps">
            {["Split the motion", "Follow the velocity", "Predict the landing"].map((step, index) => (
              <button key={step} className={activeStep === index ? "selected" : ""} onClick={() => setActiveStep(index)}><span>{index + 1}</span><div><small>STEP {index + 1}</small><b>{step}</b></div><i>›</i></button>
            ))}
          </div>
        </section>

        <aside className="tutor-panel" aria-label="AI physics tutor">
          <div className="tutor-heading">
            <div className="tutor-avatar">v</div>
            <div><h2>Ask Velo</h2><span><i /> Your physics guide</span></div>
            <button aria-label="More tutor options">•••</button>
          </div>
          <div className="mode-switch">
            <button className={guideMode ? "active" : ""} onClick={() => setGuideMode(true)}>Guide me</button>
            <button className={!guideMode ? "active" : ""} onClick={() => setGuideMode(false)}>Explain it</button>
          </div>
          <p className="mode-note">{guideMode ? "I’ll use questions and hints to help you discover the answer." : "I’ll give a concise explanation, then you can ask follow-ups."}</p>

          <div className="conversation" aria-live="polite">
            <div className="day-divider"><span>TODAY</span></div>
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                {message.role === "tutor" && <span className="mini-avatar">v</span>}
                <div><small>{message.role === "tutor" ? "VELO" : "YOU"}</small><p>{message.text}</p>{message.role === "tutor" && <button onClick={() => speak(message.text)} aria-label="Read answer aloud"><SpeakIcon /></button>}</div>
              </div>
            ))}
            <div className="hint-card"><span>TRY THIS</span><p>Set the angle to <b>60°</b>. What changes more — the height or the range?</p><button onClick={() => { setAngle(60); setProgress(0); }}>Set angle to 60°</button></div>
          </div>

          <form className="chat-form" onSubmit={submitMessage}>
            <div><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about the motion…" aria-label="Ask Velo a question" /><button type="button" onClick={() => setInput("What happens at the highest point?")} aria-label="Use voice input">⌁</button><button type="submit" aria-label="Send question">↑</button></div>
            <span>Ask anything — I’ll guide, not just tell.</span>
          </form>
        </aside>
      </div>
    </main>
  );
}
