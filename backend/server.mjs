import { createServer } from "node:http";

const port = Number(process.env.VELO_API_PORT || 8787);

const concepts = [
  {
    words: ["projectile", "throw", "launch", "ball", "trajectory"],
    title: "Projectile motion",
    explanation: "A projectile is really two motions happening at once. Horizontally, it keeps a nearly constant velocity because no horizontal force acts after launch. Vertically, gravity changes its velocity by about 9.8 metres per second every second. Combining those independent motions creates the curved path.",
    question: "Which part would you like to reason through first: the constant horizontal motion or the accelerating vertical motion?",
  },
  {
    words: ["gravity", "fall", "weight"],
    title: "Gravity",
    explanation: "Gravity is an interaction between masses. Close to Earth, it gives freely falling objects nearly the same downward acceleration, about 9.8 metres per second squared. Mass changes the gravitational force, but not the ideal free-fall acceleration.",
    question: "What do you predict would happen if two objects with different masses were dropped without air resistance?",
  },
  {
    words: ["newton", "force", "acceleration"],
    title: "Newton’s laws",
    explanation: "The key relationship is F equals m a: the net force on an object determines its acceleration. Balanced forces give zero acceleration, while an unbalanced force changes the object’s velocity. The direction of acceleration always follows the net force.",
    question: "Can you identify all the forces first, then decide whether they balance?",
  },
  {
    words: ["energy", "kinetic", "potential", "work"],
    title: "Energy",
    explanation: "Energy tracks the capacity for change. Motion carries kinetic energy, while position in a force field can store potential energy. In an isolated system the total stays constant, even though energy may move between forms.",
    question: "Where is the energy stored at the beginning, and what form does it take later?",
  },
  {
    words: ["momentum", "collision", "impact"],
    title: "Momentum",
    explanation: "Momentum is mass multiplied by velocity, so it includes both size and direction. During a collision, internal forces come in equal and opposite pairs. If outside forces are negligible, the system’s total momentum is conserved.",
    question: "What should we choose as the system before applying momentum conservation?",
  },
  {
    words: ["wave", "frequency", "wavelength", "sound"],
    title: "Waves",
    explanation: "A wave transfers energy through a repeating disturbance. Its speed equals frequency multiplied by wavelength. When the wave speed is fixed, increasing frequency makes the wavelength shorter.",
    question: "Which quantity is fixed in your situation: speed, frequency, or wavelength?",
  },
];

function localResponse(prompt, mode) {
  const normalized = prompt.toLowerCase();
  const concept = concepts.find((item) => item.words.some((word) => normalized.includes(word))) || {
    title: "Let’s model it",
    explanation: "Physics becomes manageable when we define the system, list what is known, choose a useful principle, and check whether the result has sensible units and direction. Start by describing the objects involved and what changes over time.",
    question: "What is the system, and which quantity are you trying to find?",
  };

  if (mode === "guide") {
    return {
      title: concept.title,
      answer: `${concept.question} I’ll offer one hint at a time and help you connect each step.`,
      nextStep: "Reply with your prediction—an imperfect first guess is useful.",
    };
  }

  if (mode === "visualize") {
    return {
      title: `Visual model · ${concept.title}`,
      answer: `${concept.explanation} I’ve also prepared this as a MotionForge-ready scene prompt so the same idea can be rendered as a physics animation.`,
      nextStep: "Adjust the prompt with objects, starting values, and what you want labelled.",
      motionforge: {
        status: "scene-ready",
        prompt: `Create a clear educational 2D animation for: ${prompt}`,
      },
    };
  }

  return {
    title: concept.title,
    answer: concept.explanation,
    nextStep: concept.question,
  };
}

async function ollamaResponse(prompt, mode) {
  if (process.env.VELO_PROVIDER !== "ollama") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.1",
        stream: false,
        messages: [
          { role: "system", content: `You are Velo, a concise and encouraging physics tutor. Mode: ${mode}. Use plain language, correct SI units, and no markdown headings.` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return { title: "Velo’s explanation", answer: data.message?.content, nextStep: "Ask a follow-up or switch modes to explore it another way." };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method === "GET" && request.url === "/api/health") {
    return send(response, 200, { ok: true, service: "velo-api", provider: process.env.VELO_PROVIDER || "local" });
  }
  if (request.method === "POST" && request.url === "/api/chat") {
    try {
      const body = await readJson(request);
      const prompt = String(body.prompt || "").trim();
      const mode = ["explain", "guide", "visualize"].includes(body.mode) ? body.mode : "explain";
      if (!prompt) return send(response, 400, { error: "Please enter a physics question." });
      if (prompt.length > 2000) return send(response, 400, { error: "Please keep the prompt under 2,000 characters." });
      const modelResult = await ollamaResponse(prompt, mode);
      return send(response, 200, { ...(modelResult || localResponse(prompt, mode)), mode, provider: modelResult ? "ollama" : "local", receivedAt: new Date().toISOString() });
    } catch {
      return send(response, 400, { error: "The request could not be read." });
    }
  }
  return send(response, 404, { error: "Not found" });
}).listen(port, "127.0.0.1", () => {
  console.log(`Velo API ready at http://127.0.0.1:${port}`);
});

