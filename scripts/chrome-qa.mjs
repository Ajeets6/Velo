import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = process.cwd();
const artifacts = path.join(root, "artifacts");
const profile = path.join(artifacts, "chrome-cdp-profile");
const port = 9333;

await mkdir(artifacts, { recursive: true });

const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=950,664",
  "http://127.0.0.1:5173/",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  throw new Error("Chrome DevTools target did not become available.");
}

const target = await getTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params.exceptionDetails?.text || "Runtime exception");
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    consoleErrors.push(message.params.entry.text);
  }
});

function cdp(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}

async function screenshot(name) {
  const capture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(artifacts, name), Buffer.from(capture.data, "base64"));
}

async function waitFor(expression, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 950, height: 664, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.readyState === 'complete'");
  await delay(500);
  await screenshot("welcome-950x664.png");

  await evaluate("document.querySelector('.primary-cta')?.click()");
  await waitFor("Boolean(document.querySelector('.tutor-screen'))");
  await delay(350);
  await screenshot("tutor-empty-950x664.png");

  await evaluate("document.querySelectorAll('.mode-switcher button')[2]?.click()");
  await waitFor("document.querySelector('.mode-switcher button.active')?.textContent?.includes('Visualize')");

  await evaluate(`(() => {
    const guide = document.querySelectorAll('.mode-switcher button')[1];
    guide?.click();
    const input = document.querySelector('#physics-prompt');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, 'Why does a ball follow a curved path?');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor("document.querySelector('#physics-prompt')?.value.includes('curved path')");
  await evaluate("document.querySelector('.prompt-form')?.requestSubmit()");
  await waitFor("document.querySelector('.output-copy h1')?.textContent === 'Projectile motion'");
  await delay(300);
  await screenshot("tutor-response-950x664.png");
  await evaluate("document.querySelector('.voice-button')?.click()");
  await delay(250);

  const state = await evaluate(`({
    title: document.querySelector('.output-copy h1')?.textContent,
    mode: document.querySelector('.mode-switcher button.active')?.textContent?.trim(),
    backend: document.querySelector('.backend-state')?.textContent?.trim(),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight
  })`);

  await writeFile(path.join(artifacts, "chrome-qa-results.json"), JSON.stringify({
    viewport: { width: 950, height: 664 },
    interactions: ["Get Started", "Visualize mode", "Guide mode", "Prompt entry", "Prompt submit", "Backend response", "TTS control"],
    state,
    consoleErrors,
  }, null, 2));

  process.stdout.write(JSON.stringify({ ok: true, state, consoleErrors }, null, 2));
} finally {
  socket.close();
  browser.kill("SIGTERM");
}
