# Velo UI and tutor application plan

## Purpose

This plan covers the `Velo` repository: the React interface, tutoring workflows, local Node API, TTS, settings, job orchestration, and desktop packaging.

MotionForge's scene compiler, physics engine, timeline, renderer, and executable packaging are covered separately in `G:\Git_repo\MotionForge\planmotion.md`.

## Product goal

Velo should be a local-first physics tutor with three genuinely different learning modes:

- **Explain:** a clear, level-appropriate explanation with optional speech and lightweight diagrams.
- **Guide:** an interactive lesson that asks one question at a time and remembers the student's progress.
- **Visualize:** an interactive physics animation that appears quickly and can optionally be exported as video.

No account should be required. Infrastructure settings should remain outside the main learning screen.

## Responsibility boundary

```text
Velo owns
  - learner interface and accessibility
  - Explain and Guide conversation state
  - TTS and speech controls
  - provider/model settings
  - MotionForge job orchestration
  - live Canvas player
  - cache/job metadata and local file serving
  - Tauri application lifecycle

MotionForge owns
  - prompt-to-scene compilation
  - scene validation
  - physics simulation
  - renderer-neutral timeline generation
  - optional MP4 export
```

Velo should communicate with a persistent MotionForge sidecar through a versioned JSON contract. It should not pass raw prompts as command-line arguments or parse human-readable console output in the final application.

## Current Velo issues

1. Explain, Guide, and Visualize currently use almost the same one-shot `/api/chat` flow.
2. Guide has no persistent lesson state or answer evaluation.
3. Visualize launches a new MotionForge executable for every prompt.
4. The UI waits for a complete MP4 instead of playing the simulation timeline as soon as it is available.
5. Animation jobs are kept only in Node memory and disappear after restart.
6. There is no render queue, concurrency limit, cancellation, or cleanup policy.
7. Progress is inferred from MotionForge console messages such as `[1/4]`.
8. Browser TTS reads one combined string and has no section, speed, resume, or spoken-equation handling.
9. Provider/model configuration is controlled through environment variables rather than a user-safe settings flow.
10. The desktop distribution and sidecar lifecycle are not implemented yet.

## Explain mode

### Learner flow

1. The student asks a physics question.
2. Velo uses the saved learner level or asks one short clarifying question when needed.
3. The answer starts with intuition, then introduces physics details, equations, units, and an example.
4. The student can select **Simpler**, **More detail**, **Show example**, **Listen**, or **Visualize**.
5. Follow-up questions retain the topic, terminology, and learner level.

### API contract

Replace the free-form answer with validated structured JSON:

```json
{
  "contractVersion": 1,
  "mode": "explain",
  "title": "Why satellites stay in orbit",
  "summary": "...",
  "sections": [
    { "kind": "intuition", "text": "..." },
    {
      "kind": "equation",
      "latex": "v^2/r = GM/r^2",
      "spokenText": "velocity squared divided by radius equals..."
    },
    { "kind": "example", "text": "..." }
  ],
  "checkQuestion": "...",
  "visualSuggestion": null,
  "spokenText": "..."
}
```

### Backend work

- Validate model output before returning it to React.
- Keep a bounded session summary containing learner level, current topic, introduced terminology, and recent misconceptions.
- Stream response sections so the first useful text can appear before the full answer is finished.
- Generate `spokenText` separately so TTS never reads Markdown, raw LaTeX, URLs, or control labels.
- Use deterministic SVG/Canvas diagrams for vectors, rays, graphs, forces, and simple orbits.
- Only recommend MotionForge when animation provides meaningful additional value.
- Keep Explain functional when MotionForge, FFmpeg, or a video exporter is unavailable.

### UI work

- Render structured sections rather than one large paragraph.
- Add **Simpler**, **Current level**, and **More technical** controls.
- Render equations accessibly and show definitions for variables and SI units.
- Allow TTS to speak one section or the full response.
- Add pause, resume, restart, and speed controls.
- Preserve the current prompt and explanation when switching to Visualize.

### Acceptance criteria

- First streamed content appears promptly after model generation begins.
- Follow-ups use the previous explanation context.
- Equations have readable visual and spoken representations.
- TTS does not speak formatting syntax.
- Explain works independently of MotionForge.

## Guide mode

### Learner flow

Guide must be a dialogue rather than an explanation with different wording:

1. Establish the problem and known information.
2. Ask exactly one useful question.
3. Wait for the student's response.
4. Classify it as correct, partly correct, a misconception, or unrelated.
5. Give a small hint before revealing the step.
6. Continue until the student can explain the solution.
7. End with a recap and one transfer question.

### Session API

```text
POST   /api/guide/sessions
POST   /api/guide/sessions/:id/messages
GET    /api/guide/sessions/:id
DELETE /api/guide/sessions/:id
```

Store structured state instead of an unlimited transcript:

```json
{
  "goal": "Use conservation of energy to find final speed",
  "known": ["mass", "initial height"],
  "currentStep": 2,
  "completedSteps": [1],
  "misconceptions": ["mass changes gravitational acceleration"],
  "hintLevel": 1
}
```

### Backend work

- Persist guide sessions in SQLite so progress survives restarts.
- Require structured responses with `feedback`, `nextQuestion`, `hint`, `progress`, and `isComplete`.
- Keep the solution outline in server-side state so the tutor does not reveal the final answer too early.
- Support explicit actions: Hint, Explain this step, Show a visual, Skip, and Start over.
- Summarize older turns to keep the context and latency bounded.
- Calculate progress from the lesson plan, not an invented model percentage.
- When a visual is requested, reuse its scene ID and send highlight or seek commands instead of rendering another MP4.

### UI work

- Display one current question prominently.
- Separate **Hint** from **Submit answer**.
- Show completed concepts or steps as progress.
- Put prior steps in collapsible history.
- Support typed answers first; add speech-to-text only with a confirmation step.
- Synchronize guide steps with visual highlights and timeline positions.

### Acceptance criteria

- A session survives page navigation and application restart.
- The tutor asks one question per turn and normally offers a hint before a solution.
- Wrong and partly correct answers receive targeted feedback.
- Visual-only changes such as highlights update locally without another model call.
- Context size remains bounded during a long session.

## Visualize mode

### Learner flow

1. The student submits a physical scenario.
2. Velo immediately creates a job and displays structured progress.
3. MotionForge returns a validated scene and compact timeline.
4. Velo plays the timeline in an interactive Canvas player.
5. The student can pause, scrub, replay, change speed, inspect values, and modify declared parameters.
6. MP4 generation is an optional background export.

### Velo API changes

Replace the single opaque animation job with stage-specific orchestration:

```text
POST   /api/visualizations
GET    /api/visualizations/:id
GET    /api/visualizations/:id/timeline
POST   /api/visualizations/:id/parameters
POST   /api/visualizations/:id/exports
DELETE /api/visualizations/:id
GET    /api/visualizations/:id/events
```

- Proxy versioned requests to the MotionForge sidecar.
- Use Server-Sent Events for progress, with polling as a fallback.
- Return stable stages such as `compiling`, `validating`, `simulating`, `ready`, `exporting`, and `failed`.
- Keep a playable timeline available if optional MP4 export fails.
- Add cancellation that terminates the complete child process tree when required.
- Limit MP4 export concurrency to one by default.

### Canvas player

- Use HTML Canvas 2D for the first renderer because it supports the current primitive shapes efficiently across browsers and Tauri.
- Keep world coordinates independent of viewport size.
- Interpolate positions and angles using display timestamps.
- Add play/pause, restart, scrubber, frame stepping, and 0.25x-2x speed.
- Add keyboard controls and accessible names for every control.
- Provide an inspect panel for values exposed by the timeline, such as position, velocity, force, energy, and momentum.
- Re-simulate safe parameter changes without another LLM request.
- Respect reduced-motion preferences and do not require autoplay.

### Acceptance criteria

- Cached or template scenes begin playing in under 1 second.
- A new scene plays once compilation and simulation finish; MP4 export does not block it.
- Pause, seek, replay, and speed changes do not regenerate the scene.
- Cancelling a job stops work and updates the UI clearly.
- Multiple requests cannot start unlimited render processes.

## Local backend and data model

### Persistent storage

Use SQLite for:

- guide session state and summaries;
- visualization job metadata;
- scene/timeline cache records;
- model/provider preferences;
- cleanup timestamps and file sizes.

Store generated files under the operating system's application-data directory. Use atomic writes and job-generated identifiers. Never construct output or deletion paths from prompt text.

### Stable errors

Return errors with a safe message and stable code:

```text
MODEL_UNAVAILABLE
MOTIONFORGE_UNAVAILABLE
INVALID_SCENE
SIMULATION_FAILED
EXPORT_FAILED
CANCELLED
TIMEOUT
DISK_FULL
CONTRACT_MISMATCH
```

The UI should offer a relevant recovery action rather than showing raw process logs.

### Provider interface

Support one capability-based interface in the Node backend:

```text
health()
listModels()
generateText()
generateStructured(schema)
cancel(requestId)
```

- Keep tutor-chat and scene-compiler model settings separate.
- Detect schema-output support instead of assuming it.
- Present friendly choices such as **On-device**, **Cloud**, **Fast**, **Balanced**, and **Best**.
- Put raw model names and URLs under Advanced settings.

## Settings and first-run experience

Recommended first-run flow:

1. Welcome.
2. Choose On-device or Cloud.
3. Detect Ollama automatically.
4. Recommend a compatible installed model.
5. Run a connection and structured-output test.
6. Check MotionForge health and available exporters.
7. Open the tutor.

Store API keys only in Windows Credential Manager, macOS Keychain, or Linux Secret Service through the Tauri/backend layer. Never expose them to React state, browser storage, command-line arguments, URLs, logs, or crash reports.

## Desktop packaging

- Use Tauri as the desktop shell.
- Bundle the built React application, local API, MotionForge sidecar, default configuration, and required runtime resources.
- Start MotionForge once when needed and stop it when Velo exits.
- Bind local services only to `127.0.0.1` and use a per-launch secret between processes.
- Check the MotionForge API and contract version before enabling Visualize.
- Write configuration, databases, cache, logs, and exports to OS-managed locations.
- Sign installers and support normal uninstall and upgrade behavior.
- Keep a browser-only development mode that can connect to the same local APIs.

## Accessibility and compatibility

- Support keyboard-only operation and visible focus indicators.
- Use live regions for meaningful job status changes without announcing every frame.
- Add captions or a transcript for spoken explanations.
- Respect reduced motion, contrast, text scaling, and browser autoplay policies.
- Test high-DPI displays and responsive layouts.
- Encode exported MP4 as H.264 `yuv420p` with fast-start metadata; keep Canvas as the universal preview path.
- Do not expose local filesystem paths to the frontend. Serve job-scoped URLs with byte-range support.

## Testing plan

### Unit and contract tests

- Explain response validation and TTS-safe conversion.
- Guide state transitions, hints, misconception tracking, and completion.
- SQLite persistence and restart recovery.
- Provider capability and error mapping.
- Velo-to-MotionForge contract-version handling.
- Cache keys, cleanup rules, and validated file paths.

### End-to-end tests

- Explain streaming, follow-up, difficulty change, and speech controls.
- Guide with correct, partial, incorrect, and unrelated answers.
- Visualize compile, progress, Canvas playback, parameter change, export, and cancellation.
- Backend or MotionForge restart during a job.
- Missing Ollama, model, MotionForge, FFmpeg, font, network, or disk space.
- Video byte ranges and seeking.

### Distribution tests

- Install on clean supported operating-system virtual machines.
- Test without Python, Node, Manim, FFmpeg, Ollama, or developer fonts already installed.
- Test paths with spaces and non-ASCII characters.
- Test offline launch, abrupt shutdown, update, and uninstall.
- Measure startup time, first response latency, first visualization latency, memory, CPU, and disk use.

## Delivery phases

### Phase UI-0: stabilize the current integration

- [ ] Add stable errors and separate compile, simulation, and export timeouts.
- [ ] Add one-export concurrency, cancellation, and safe cleanup.
- [ ] Persist animation jobs and recover completed videos after restart.
- [ ] Add end-to-end tests around the existing MP4 workflow.

**Exit condition:** the present workflow is bounded, cancellable, recoverable, and understandable when it fails.

### Phase UI-1: real tutor modes

- [ ] Version Explain and Guide contracts.
- [ ] Implement structured Explain sections, streaming, and TTS-safe text.
- [ ] Implement persistent Guide sessions and answer evaluation.
- [ ] Add provider capability detection and separate tutor/compiler settings.

**Exit condition:** Explain and Guide behave differently by design and do not depend on video rendering.

### Phase UI-2: interactive visualization

- [ ] Integrate the versioned MotionForge scene/timeline APIs.
- [ ] Build the Canvas player and inspectable overlays.
- [ ] Add structured progress, cancellation, and parameter updates.
- [ ] Make MP4 an optional background export.

**Exit condition:** the student can interact with a visualization before an MP4 would have finished.

### Phase UI-3: desktop distribution

- [ ] Add first-run provider setup and advanced settings.
- [ ] Integrate MotionForge sidecar lifecycle with Tauri.
- [ ] Store secrets and application data in OS-managed locations.
- [ ] Package, sign, and test per-platform installers.

**Exit condition:** a non-developer can install, use all three modes, restart, update, and uninstall without developer tooling.

## Recommended implementation order

1. Define versioned Explain, Guide, job, progress, error, SceneSpec, and Timeline contracts.
2. Add stable job persistence, cancellation, concurrency limits, and timeouts.
3. Implement structured Explain and persistent Guide sessions.
4. Integrate the persistent MotionForge sidecar and Canvas timeline player.
5. Add settings, Tauri lifecycle management, credential storage, and clean-machine packaging tests.

