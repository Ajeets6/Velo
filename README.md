# Velo

Velo is a local-first physics tutor with a React frontend and a small Node API. It requires no login or API key.

## Development with GPT-5.6

GPT-5.6 was used as an AI development assistant while building Velo. It helped turn product requirements into implementation plans, write and refine the React frontend and Node API, investigate defects, and create and review automated tests. Its suggestions were validated against the repository and the application was tested as part of the normal development workflow.

GPT-5.6 is a development aid, not a runtime dependency. Velo still runs locally without a login or API key, and users can independently choose one of the supported model providers for tutoring and visualization features.

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
- Cloud API keys are stored only in the operating system credential vault: Credential Manager on Windows, Keychain on macOS, and Secret Service on Linux. Linux users need an unlocked Secret Service-compatible keyring such as GNOME Keyring or KWallet; Velo does not fall back to plaintext key storage.
- Set `VELO_PROVIDER=ollama` to use a local Ollama model. Optionally set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Visualize mode returns a `motionforge` scene prompt compatible with the sibling `MotionForge` pipeline at `G:\Git_repo\MotionForge`.
- Visualize mode also runs `MotionForge\dist\prompt-animator.exe` with `gpt-oss:120b-cloud` and embeds the completed MP4 in the tutor UI. Override the executable or model with `MOTIONFORGE_EXECUTABLE` and `MOTIONFORGE_MODEL`.

The browser uses its built-in Speech Synthesis API for text-to-speech.
