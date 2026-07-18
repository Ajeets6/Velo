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
- Credential-free physics responses work by default.
- Set `VELO_PROVIDER=ollama` to use a local Ollama model. Optionally set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Visualize mode returns a `motionforge` scene prompt compatible with the sibling `MotionForge` pipeline at `G:\Git_repo\MotionForge`.

The browser uses its built-in Speech Synthesis API for text-to-speech.
