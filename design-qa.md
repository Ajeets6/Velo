# Velo design QA

**Source visual truth**

- User-provided layout wireframe in the original build request: 950 × 664 desktop composition.
- The source is a conversation attachment and does not expose a filesystem path. It specifies the hierarchy and proportions: header, wide mode selector, centred TTS control, model-output region, and bottom input region.
- Visual treatment intentionally follows the accompanying request for an Apple-ecosystem aesthetic rather than the wireframe’s schematic primary colors.

**Implementation evidence**

- Welcome screen: `artifacts/welcome-950x664.png`
- Tutor empty state: `artifacts/tutor-empty-950x664.png`
- Tutor response state: `artifacts/tutor-response-950x664.png`
- Automated results: `artifacts/chrome-qa-results.json`
- Local URL: `http://localhost:5173/`
- Browser: Google Chrome headless
- Viewport: 950 × 664, device scale factor 1

**State**

- No login.
- User entered through Get Started.
- Guide mode selected after verifying Visualize mode selection.
- Prompt: “Why does a ball follow a curved path?”
- Backend response title: “Projectile motion”.
- Backend indicator: “Local backend”.

**Full-view comparison evidence**

- The implementation preserves the reference’s five-region vertical hierarchy and dominant centred column.
- Header, mode selector, voice control, output card, and input all remain visible within 950 × 664.
- The output and input widths preserve the wireframe’s relationship: output is slightly narrower than the prompt area.
- The requested Apple-like adaptation is consistent across the screen: system typography, restrained neutral palette, translucent surfaces, segmented control, blue semantic action color, large radii, and soft elevation.
- Chrome reported no horizontal or vertical document overflow.

**Focused region comparison evidence**

- A separate crop was not required. At the native 950 × 664 capture, the mode labels, output typography, backend status, prompt chips, input affordance, and TTS label are all readable without scaling ambiguity.

**Required fidelity surfaces**

- Fonts and typography: Apple system-font stack renders correctly. Heading, body, label, and control hierarchy are distinct; no wrapping or truncation defects appear in either captured tutor state.
- Spacing and layout rhythm: centred alignment, wide mode pill, circular TTS control, output/input proportions, and vertical sequence match the wireframe. All persistent controls fit the viewport.
- Colors and visual tokens: neutral `#f5f5f7` surface, dark foreground, secondary gray, Apple blue, green backend status, translucent white cards, and restrained shadows are applied consistently.
- Image quality and asset fidelity: the source contains no photographic or illustrative assets. Interface icons use Phosphor React components and render sharply; no placeholders or improvised glyphs are used.
- Copy and content: product-specific labels are clear and complete—Explain, Guide, Visualize, Listen, Ask Velo, backend status, and realistic physics output.

**Primary interactions tested**

- Get Started opens the tutor workspace.
- Visualize mode becomes selected.
- Guide mode becomes selected.
- Prompt text is entered through the textarea.
- Form submission reaches the local backend.
- The backend response is rendered in the output card.
- The TTS control can be invoked.
- Backend status reports online.

**Console errors checked**

- Final Chrome headless run: zero runtime exceptions and zero error log entries.

**Findings**

- No actionable P0, P1, or P2 findings remain.

**Comparison history**

1. Initial attempt was blocked because the in-app browser runtime could not start.
2. Chrome headless first pass captured the real 950 × 664 UI and found one browser resource 404.
3. Added an explicit empty favicon data URI to prevent the unsolicited request.
4. Final Chrome headless pass exercised the complete primary journey, recorded zero console errors, confirmed no overflow, and captured the empty and answered tutor states.

**Implementation Checklist**

- [x] Preserve reference layout hierarchy.
- [x] Apply the requested Apple-like visual system.
- [x] Verify prompt-to-backend response through the UI.
- [x] Verify modes and TTS control.
- [x] Capture native-viewport evidence.
- [x] Check console errors and viewport overflow.

**Follow-up Polish**

- P3: A future pass could capture dark mode if that becomes a product requirement; it is not present in the source or current scope.

final result: passed
