import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import { createViewport } from "./interactive-viewport.js";

function sample(track, time) {
  if (!track?.times?.length) return null;
  let index = track.times.findIndex((item) => item >= time);
  if (index < 0) index = track.times.length - 1;
  if (!index) {
    return Object.fromEntries(
      Object.entries(track).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    );
  }
  const a = index - 1;
  const ratio = (time - track.times[a]) / (track.times[index] - track.times[a]);
  const value = (key) =>
    !track[key]?.length ? undefined : track[key][a] + (track[key][index] - track[key][a]) * ratio;
  return {
    x: value("x"), y: value("y"), angle: value("angle"), vx: value("vx"), vy: value("vy"),
    ax: value("ax"), ay: value("ay"), force_x: value("force_x"), force_y: value("force_y"),
    kinetic_energy: value("kinetic_energy"), potential_energy: value("potential_energy"),
    momentum_x: value("momentum_x"), momentum_y: value("momentum_y"),
  };
}

function drawTrail(ctx, track, time, viewport, color, sampleEvery = 2) {
  if (!track?.times?.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(1, viewport.scale * 1.5);
  ctx.beginPath();
  let started = false;
  for (let index = 0; index < track.times.length && track.times[index] <= time; index += sampleEvery) {
    const [x, y] = viewport.point(track.x[index], track.y[index]);
    if (started) ctx.lineTo(x, y);
    else { ctx.moveTo(x, y); started = true; }
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function contrastColor(background) {
  const match = /^#([0-9a-f]{6})$/i.exec(background || "");
  if (!match) return "#182230";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 128 ? "#FFFFFF" : "#182230";
}

function drawObject(ctx, object, state, viewport, dpr, background) {
  const [x, y] = viewport.point(state.x, state.y);
  const scale = viewport.scale;
  const color = object.color || "#378ADD";
  const strokeColor = color.toUpperCase() === String(background || "").toUpperCase()
    ? contrastColor(background)
    : color;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-(state.angle || 0));
  ctx.fillStyle = color;
  ctx.strokeStyle = strokeColor;
  ctx.globalAlpha = object.opacity ?? 0.9;
  ctx.lineWidth = Math.max(dpr, (object.strokeWidth || 2) * dpr);
  ctx.beginPath();
  if (object.shape === "segment") {
    const [ax, ay] = object.pointA || [0, 0];
    const [bx, by] = object.pointB || [1, 0];
    ctx.moveTo(ax * scale, -ay * scale);
    ctx.lineTo(bx * scale, -by * scale);
    ctx.lineWidth = Math.max(2 * dpr, (object.segmentRadius || 2) * scale * 2);
    ctx.stroke();
  } else if (object.shape === "box") {
    const width = (object.width || 10) * scale;
    const height = (object.height || 10) * scale;
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.fill();
    ctx.stroke();
  } else if (object.shape === "polygon" && object.vertices?.length >= 3) {
    object.vertices.forEach(([vx, vy], index) => {
      if (index) ctx.lineTo(vx * scale, -vy * scale);
      else ctx.moveTo(vx * scale, -vy * scale);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.arc(0, 0, Math.max(5 * dpr, (object.radius || 10) * scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  if (object.showLabel && object.label) {
    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.globalAlpha = 1;
    ctx.font = `${12 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const labelOffset = Math.max(10 * dpr, ((object.radius || object.height || 10) * scale) + 4 * dpr);
    ctx.fillText(object.label, x, y - labelOffset);
    ctx.restore();
  }
}

export default function InteractivePanel({ timeline, onParameters }) {
  const canvasRef = useRef(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const ids = useMemo(() => Object.keys(timeline.scene?.objects || {}), [timeline]);
  const [selected, setSelected] = useState(ids[0] || "");
  const duration = timeline.duration || 1;

  useEffect(() => { setTime(0); setPlaying(false); setSelected(ids[0] || ""); }, [timeline, ids]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const viewport = createViewport(timeline.scene, canvas.width, canvas.height);
      const background = timeline.scene.background || "#fff";
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (timeline.scene.trail?.enabled) {
        for (const id of ids) {
          const object = timeline.scene.objects[id];
          if (!object.isStatic) {
            drawTrail(ctx, timeline.tracks[id], time, viewport, object.color || "#378ADD", timeline.scene.trail.sampleEvery || 2);
          }
        }
      }
      for (const id of ids) {
        const state = sample(timeline.tracks[id], time);
        if (state) drawObject(ctx, timeline.scene.objects[id], state, viewport, dpr, background);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [timeline, time, ids]);
  useEffect(() => {
    if (!playing) return undefined;
    let previous;
    let frame;
    const tick = (now) => {
      if (previous) setTime((value) => Math.min(duration, value + ((now - previous) / 1000) * rate));
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, rate]);
  useEffect(() => { if (time >= duration) setPlaying(false); }, [time, duration]);

  const current = sample(timeline.tracks[selected], time);
  const values = [
    ["Position", current && `${current.x?.toFixed(1)}, ${current.y?.toFixed(1)}`],
    ["Velocity", current && `${current.vx?.toFixed(1)}, ${current.vy?.toFixed(1)}`],
    ["Acceleration", current && `${current.ax?.toFixed(1)}, ${current.ay?.toFixed(1)}`],
    ["Force", current && `${current.force_x?.toFixed(1)}, ${current.force_y?.toFixed(1)}`],
    ["Kinetic energy", current?.kinetic_energy], ["Potential energy", current?.potential_energy],
    ["Momentum", current && `${current.momentum_x?.toFixed(1)}, ${current.momentum_y?.toFixed(1)}`],
  ].filter(([, value]) => value !== undefined);

  return <section className="interactive-panel"><canvas ref={canvasRef} role="img" aria-label={timeline.scene?.title || "Interactive physics timeline"} /><div className="timeline-controls"><button onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause simulation" : "Play simulation"}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button><button onClick={() => { setPlaying(false); setTime(0); }} aria-label="Restart simulation"><ArrowCounterClockwise weight="bold" /></button><input aria-label="Timeline position" type="range" min="0" max={duration} step="0.01" value={time} onChange={(event) => setTime(Number(event.target.value))} /><select aria-label="Playback speed" value={rate} onChange={(event) => setRate(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></div><div className="inspect-panel"><strong>Inspect</strong><select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Object to inspect">{ids.map((id) => <option key={id}>{id}</option>)}</select>{values.map(([label, value]) => <span key={label}><b>{label}</b> {typeof value === "number" ? value.toFixed(2) : value}</span>)}</div>{timeline.parameters?.length > 0 && <div className="parameter-panel"><strong>Parameters</strong>{timeline.parameters.map((parameter) => <label key={parameter.id}>{parameter.id}<input type="number" defaultValue={parameter.default} min={parameter.minimum} max={parameter.maximum} onBlur={(event) => onParameters({ [parameter.id]: Number(event.target.value) })} /></label>)}</div>}</section>;
}
