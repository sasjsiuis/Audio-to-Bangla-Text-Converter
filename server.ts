import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load local environment variables (if any)
dotenv.config();

const app = express();
const PORT = 3000;

// Increase file parsing limits to support base64 audio payloads comfortably
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Lazy check/initialization of the Google GenAI SDK to prevent applet crashing on mount if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but not configured. Set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// REST API Health Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// REST API endpoint to transcribe audio to Bangla Text
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType, customPrompt } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: "Missing required parameter 'audioBase64'" });
    }

    const ai = getGeminiClient();

    // Default target transcribing instructions for Bangla conversion
    const promptText = customPrompt || 
      "You are an expert Bangla (Bengali) transcriber. Listen carefully to the audio and transcribe speech into natural, accurate, grammar-corrected Bangla text (using traditional Bengali script). " +
      "Only return the Bangla transcription string itself. Do not include any english explanations, notes, or meta comments like 'Here is the translation'. " +
      "If there is only static, silence, or no voice spoken, leave it blank or write '[কোনো স্পষ্ট কথা শোনা যায়নি]'. " +
      "If some English/foreign phrases are integrated in conversation, transcribe them phonetically in Bangla or keeps standard terms (e.g., 'ফোন' for phone, 'কম্পিউটার').";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "audio/webm",
              data: audioBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
    });

    const transcriptionText = response.text || "";
    res.json({ transcription: transcriptionText.trim() });
  } catch (error: any) {
    console.error("Transcription API Error:", error);
    res.status(500).json({
      error: error.message || "Failed to transcribe audio. Ensure Gemini API key is configured properly."
    });
  }
});

// Start routing for Vite serving
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite dev middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("Vite server initialization failed:", err);
  process.exit(1);
});
