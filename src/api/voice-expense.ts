import logger from "../lib/logger.js";
import { InferenceClient } from "@huggingface/inference";

function safeJsonParse(text: string): unknown {
  const cleaned = (text || "").trim();
  if (!cleaned) throw new Error("Empty model response");
  
  let extracted = cleaned;
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1) {
    extracted = cleaned.substring(firstObj, lastObj + 1);
  }
  return JSON.parse(extracted);
}

export async function processVoiceExpense(req: any, res: any) {
  try {
    const user = req.user;
    const { transcript } = req.body;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "Voice transcript is required" });
    }

    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY is not configured");
    }

    const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
    
    // We use a small, fast model to extract the structured data
    const prompt = `Extract the transaction details from the following voice transcript.
Transcript: "${transcript}"
Extract the data into a strict JSON object with exactly these keys: "amount" (number), "merchant" (string), and "category" (string). If a category isn't obvious, guess it.
Output only the JSON.`;

    const response = await hf.textGeneration({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      inputs: prompt,
      parameters: { max_new_tokens: 150, temperature: 0.1 },
    });

    let extractedData: any;
    try {
      extractedData = safeJsonParse(response.generated_text);
    } catch (parseErr) {
      logger.error("VOICE_PARSE_ERROR", { raw_response: response.generated_text });
      return res.status(500).json({ error: "Failed to parse expense from transcript" });
    }

    // In a real implementation, we would insert this directly into Firestore:
    // await getFirestore().collection("transactions").add({
    //   userId: user.uid,
    //   ...extractedData,
    //   date: new Date().toISOString()
    // });

    res.json({
      success: true,
      message: "Expense logged successfully",
      data: extractedData
    });

  } catch (error: any) {
    logger.error("VOICE_EXPENSE_ERROR", { message: error.message });
    res.status(500).json({ error: "Internal server error processing voice expense" });
  }
}
