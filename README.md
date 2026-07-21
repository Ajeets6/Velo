# Velo

Velo is a local-first physics tutor with a React frontend and a small Node API. It requires no login or API key.

## Development with GPT-5.6 and Codex

GPT-5.6 was used as an AI development assistant while building Velo. It helped turn product requirements into implementation plans, explore design and architecture choices, and reason through defects and testing strategies.

Codex was used alongside GPT-5.6 as a repository-aware coding agent. It inspected the existing codebase, implemented and refined the React frontend and Node API, updated documentation, ran automated tests, and verified changes against the application's actual behavior. AI-generated suggestions and code were reviewed and validated as part of the normal development workflow.

GPT-5.6 and Codex were development aids, not runtime dependencies. Velo still runs locally without a login or API key, and users can independently choose one of the supported model providers for tutoring and visualization features.

## Run locally

Velo uses the packaged Prompt Animator from [MotionForge](https://github.com/Marri-Meghadri31/MotionForge) for visualization. Before starting Velo:

1. Open the [latest MotionForge release](https://github.com/Marri-Meghadri31/MotionForge/releases/latest).
2. Download the Windows Prompt Animator archive.
3. Extract the archive's contents into the `vendor` directory. Keep the extracted layout intact; `vendor/prompt-animator.exe` and `vendor/_internal` must both exist.

Then install the Node dependencies and start the web app:

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
- Visualize mode returns a `motionforge` scene prompt compatible with the MotionForge pipeline.
- Visualize mode runs `vendor/prompt-animator.exe` with `gpt-oss:120b-cloud` and embeds the completed MP4 in the tutor UI. Override the executable or model with `MOTIONFORGE_EXECUTABLE` and `MOTIONFORGE_MODEL`.

The browser uses its built-in Speech Synthesis API for text-to-speech.
