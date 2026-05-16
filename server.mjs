import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: ".env.local" });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;

const sessionConfig = JSON.stringify({
  type: "realtime",
  model: "gpt-realtime-2",
  instructions:
    "You are ChatGPT in a realtime voice conversation. Speak Japanese by default. Keep replies concise, natural, and conversational. If the user asks for technical help, be concrete and practical.",
  audio: {
    output: {
      voice: "marin"
    }
  }
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    model: "gpt-realtime-2",
    hasOpenAIKey: Boolean(apiKey)
  });
});

app.post("/session", async (req, res) => {
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    return;
  }

  if (!req.body || typeof req.body !== "string") {
    res.status(400).json({ error: "Expected an SDP offer in the request body." });
    return;
  }

  const formData = new FormData();
  formData.set("sdp", req.body);
  formData.set("session", sessionConfig);

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": "local-dev-user"
      },
      body: formData
    });

    const body = await upstream.text();

    if (!upstream.ok) {
      console.error(`Realtime session failed: ${upstream.status} ${body}`);
      res.status(upstream.status).type("application/json").send(
        JSON.stringify({
          error: "Failed to create a realtime session.",
          status: upstream.status,
          detail: safeOpenAIError(body)
        })
      );
      return;
    }

    res.status(200).type("application/sdp").send(body);
  } catch (error) {
    console.error("Realtime session error:", error);
    res.status(500).json({ error: "Failed to create a realtime session." });
  }
});

app.listen(port, () => {
  console.log(`GPT-Realtime-2 voice chat: http://localhost:${port}`);
});

function safeOpenAIError(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || parsed.error || parsed;
  } catch {
    return body.slice(0, 500);
  }
}
