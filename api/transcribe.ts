import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
    );
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { audioBase64, mimeType, customPrompt } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: "Missing required parameter 'audioBase64'" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is not configured on Vercel environment variables. Please go to Vercel Dashboard > Project Settings > Environment Variables, and add GEMINI_API_KEY." 
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

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
    return res.status(200).json({ transcription: transcriptionText.trim() });
  } catch (error: any) {
    console.error("Transcription API Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio. Verify your Gemini API credentials."
    });
  }
}
