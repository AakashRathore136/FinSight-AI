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

    // --- Harden the LLM-produced query before it is returned for execution ---
    // The model is never trusted to author tenant scoping. We validate the
    // shape against a strict schema and force the authenticated user's tenant
    // id into the `where` clause, rejecting any caller/model-supplied tenantId
    // and any NoSQL-injection operators (keys starting with `$`).

    if (!parsedQuery || typeof parsedQuery !== "object" || Array.isArray(parsedQuery)) {
      return res.status(422).json({ error: "Model did not return a valid query object" });
    }

    const ALLOWED_KEYS = new Set(["collection", "where", "orderBy", "limit"]);
    for (const key of Object.keys(parsedQuery)) {
      if (!ALLOWED_KEYS.has(key)) {
        delete (parsedQuery as Record<string, unknown>)[key];
      }
    }

    if (typeof (parsedQuery as any).collection !== "string") {
      (parsedQuery as any).collection = "transactions";
    }
    if (
      (parsedQuery as any).limit != null &&
      (typeof (parsedQuery as any).limit !== "number" || (parsedQuery as any).limit < 0)
    ) {
      delete (parsedQuery as any).limit;
    }

    if (!user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Recursively strip any tenant scoping or NoSQL-injection operators
    // (keys starting with `$`, e.g. $gt/$in/$or) at EVERY depth of the query
    // object — not just the top level of `where` — so a nested operator such as
    // `{ "status": { "$ne": "rejected" } }` or `{ "and": [ { "amount": { "$gt": 100 } } ] }`
    // cannot survive and be executed against the database.
    let foundInjectionOperator = false;
    const stripUnsafeKeys = (node: any): void => {
      if (Array.isArray(node)) {
        node.forEach(stripUnsafeKeys);
        return;
      }
      if (node && typeof node === "object") {
        for (const key of Object.keys(node)) {
          if (key === "tenantId" || key.startsWith("$")) {
            delete node[key];
            foundInjectionOperator = true;
            continue;
          }
          stripUnsafeKeys(node[key]);
        }
      }
    };
    stripUnsafeKeys(parsedQuery);
    if (foundInjectionOperator) {
      return res.status(400).json({ error: "Unsupported query operators detected in request." });
    }

    const where =
      (parsedQuery as any).where && typeof (parsedQuery as any).where === "object" && !(parsedQuery as any).where instanceof Array
        ? (parsedQuery as any).where
        : {};

    // Force the authenticated user's tenant id — multi-tenant isolation is
    // guaranteed here, regardless of what the model emitted.
    where.tenantId = user.uid;
    (parsedQuery as any).where = where;
    // Ensure no top-level tenantId override leaks through either.
    delete (parsedQuery as any).tenantId;

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
