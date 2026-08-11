import { InferenceClient } from "@huggingface/inference";
import logger from "../lib/logger.js";

// Utility to parse JSON out of LLM responses safely
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

export async function handleTextToQuery(req: any, res: any) {
  try {
    const { query } = req.body;
    const user = req.user;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "A natural language query is required" });
    }

    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY is not configured");
    }

    const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
    
    const prompt = `Convert the following natural language request into a JSON object representing a database query for a financial transactions collection. 
Request: "${query}"
The collection is named "transactions". The fields are: amount (number), category (string), date (string), merchant (string).
Output valid JSON only with keys: "collection", "where", "orderBy", "limit".`;

    const response = await hf.textGeneration({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      inputs: prompt,
      parameters: { max_new_tokens: 150, temperature: 0.1 },
    });

    let parsedQuery;
    try {
      parsedQuery = safeJsonParse(response.generated_text);
    } catch (parseErr) {
      return res.status(500).json({ error: "Failed to parse LLM response into a valid query" });
    }

    // Attach user constraint for multi-tenant data isolation
    if (parsedQuery && typeof parsedQuery === 'object') {
      (parsedQuery as any).tenantId = user?.uid || "unauthenticated";
    }

    res.json({
      success: true,
      originalQuery: query,
      parsedIntent: parsedQuery,
    });

  } catch (error: any) {
    logger.error("TEXT_TO_QUERY_ERROR", { message: error.message });
    res.status(500).json({ error: "Internal server error processing the natural language query" });
  }
}
