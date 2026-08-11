/**
 * Stack-Based Streaming JSON Repair & Truncation Recovery Engine
 * Resiliently parses and repairs partially truncated JSON strings from LLMs.
 */

export interface JSONRepairResult<T = any> {
  data: T | null;
  repaired: boolean;
  salvagedKeys: string[];
  error?: string;
}

/**
 * Repairs truncated or malformed JSON output from LLM responses using a stack-based state machine.
 */
export function repairTruncatedJSON<T = any>(rawText: string): JSONRepairResult<T> {
  const cleaned = (rawText || "").trim();
  if (!cleaned) {
    return { data: null, repaired: false, salvagedKeys: [], error: "Empty string" };
  }

  // 1. Extract JSON block if surrounded by markdown fence ```json ... ```
  let targetText = cleaned;
  const jsonFenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    targetText = jsonFenceMatch[1].trim();
  } else {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      targetText = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  // 2. Try direct JSON.parse first
  try {
    const parsed = JSON.parse(targetText);
    const keys = typeof parsed === "object" && parsed ? Object.keys(parsed) : [];
    return { data: parsed as T, repaired: false, salvagedKeys: keys };
  } catch (_e) {
    // Proceed to stack-based state machine repair
  }

  // 3. Stack-based repair algorithm
  let repairedText = targetText;

  // Step A: Fix trailing unescaped control chars / trailing commas
  repairedText = repairedText
    .replace(/,\s*([}\]])/g, "$1") // remove trailing commas before closing brackets
    .replace(/,\s*$/g, ""); // remove trailing comma at end of stream

  const stack: Array<"OBJECT" | "ARRAY"> = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < repairedText.length; i++) {
    const char = repairedText[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") stack.push("OBJECT");
      else if (char === "}") stack.pop();
      else if (char === "[") stack.push("ARRAY");
      else if (char === "]") stack.pop();
    }
  }

  // If stream ended inside a string quote, close the quote
  if (inString) {
    repairedText += '"';
  }

  // If stream ended inside a key colon (e.g., `"key":`), append dummy value
  if (repairedText.trim().endsWith(":")) {
    repairedText += " null";
  }

  // Close remaining unclosed objects/arrays in reverse order
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === "OBJECT") {
      repairedText += "}";
    } else if (top === "ARRAY") {
      repairedText += "]";
    }
  }

  // Final sanitize pass for trailing commas created during repair
  repairedText = repairedText.replace(/,\s*([}\]])/g, "$1");

  try {
    const parsed = JSON.parse(repairedText);
    const keys = typeof parsed === "object" && parsed ? Object.keys(parsed) : [];
    return {
      data: parsed as T,
      repaired: true,
      salvagedKeys: keys,
    };
  } catch (err: any) {
    return {
      data: null,
      repaired: false,
      salvagedKeys: [],
      error: `JSON repair machine failed: ${err?.message || String(err)}`,
    };
  }
}
