# Velo

Velo is a local-first physics tutor with a React frontend and a small Node API. It requires no login or API key.

## Run locally

```bash
npm install
npm run dev
```

The development command starts both the Vite frontend and the API. Open the local URL shown in the terminal.

## Backend

- `GET /api/health` checks the local API.
- `POST /api/chat` accepts `{ "prompt": string, "mode": "explain" | "guide" | "visualize" }`.
- `POST /api/animations` starts a packaged MotionForge render and returns a job ID.
- `GET /api/animations/{id}` reports queued, running, complete, or failed.
- `/renders/{id}/animation.mp4` streams the finished video with byte-range support.
- Credential-free physics responses work by default.
- Set `VELO_PROVIDER=ollama` to use a local Ollama model. Optionally set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Visualize mode returns a `motionforge` scene prompt compatible with the sibling `MotionForge` pipeline at `G:\Git_repo\MotionForge`.
- Visualize mode also runs `MotionForge\dist\prompt-animator.exe` with `gpt-oss:120b-cloud` and embeds the completed MP4 in the tutor UI. Override the executable or model with `MOTIONFORGE_EXECUTABLE` and `MOTIONFORGE_MODEL`.

The browser uses its built-in Speech Synthesis API for text-to-speech.
