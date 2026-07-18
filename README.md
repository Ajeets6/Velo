# Velo

An interactive physics tutor that combines guided conversation, spoken explanations, and manipulable visual lessons.

## Product prototype

The current lesson demonstrates projectile motion with:

- a live animation driven by launch angle and speed;
- Guide and Explain conversation modes;
- browser-native text-to-speech;
- staged explanation cards and prompts;
- responsive desktop and mobile layouts.

Run with `npm run dev` and build with `npm run build`.

## Recommended architecture

Use **React + TypeScript** for the learning interface. React is a good fit for synchronising chat, lesson state, simulation controls, captions, and audio playback. Keep immediate low-fidelity animations in the browser (Canvas with PixiJS is the next step; Matter.js is useful if browser-side physics is required).

Keep **MotionForge in Python** as a dedicated render worker because Pymunk and Manim are already its strongest dependencies. Add a small FastAPI adapter exposing asynchronous jobs rather than calling its CLI directly:

1. `POST /v1/animations` validates a scene request and returns a job ID.
2. A worker calls MotionForge's existing `run()` pipeline.
3. `GET /v1/animations/{id}` returns queued, rendering, complete, or failed.
4. Completed MP4 files are stored in object storage and returned as signed URLs.

For the conversation and lesson API, use **TypeScript with Fastify** (or Hono if deploying at the edge). It can stream tutor responses over SSE, share request types with the frontend, coordinate TTS, and enqueue MotionForge jobs. This gives the product a fast TypeScript interaction layer without rewriting the Python renderer.

Suggested production split:

```text
React/TypeScript UI
  -> TypeScript tutor API (Fastify): chat, lesson state, streaming, auth
  -> Python render API (FastAPI): MotionForge validation and job submission
  -> Python workers: Pymunk simulation + Manim rendering
  -> object storage: MP4, captions, thumbnails
```

Do not render Manim videos synchronously inside a chat request. The UI should show an instant Canvas preview, then swap in the higher-quality MotionForge output when the background job completes.
