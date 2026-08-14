import { RAGEngine } from "../rag/ragEngine";
import type { DocumentChunk } from "../rag/textChunker";
import type { GroundedClaim, Citation } from "./types";

function safeJsonParse(text: string): any {
  const cleaned = (text || "").trim();
  if (!cleaned) return null;
  
  // Extract JSON structure if wrapped in markdown formatting
  let extracted = cleaned;
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1) {
    extracted = cleaned.substring(firstObj, lastObj + 1);
  }
  
  try {
    return JSON.parse(extracted);
  } catch (err: any) {
    // Basic repair attempt if trailing commas or newlines cause issues
    const repaired = extracted
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_m, p1) => {
        return '"' + p1.replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
      });
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

export interface AdjudicationVerdict {
  claimId: string;
  verdict: "supported" | "partial" | "unsupported";
  chunkId: string;
  reason: string;
  retrievedChunkIds: string[];
}

/**
 * Verifies unverified claims using model-based adjudication.
 * Leverages a request-isolated RAG engine to query context chunks for each claim.
 */
export async function adjudicateClaims(
  unverifiedClaims: GroundedClaim[],
  chunks: DocumentChunk[],
  hfClient: any
): Promise<Record<string, AdjudicationVerdict>> {
  if (unverifiedClaims.length === 0) return {};

  // Setup request-scoped isolated RAG engine to prevent cross-tenant leaks
  const ragEngine = new RAGEngine();
  ragEngine.indexChunks(chunks);

  const results: Record<string, AdjudicationVerdict> = {};
  const batchSize = 15;

  for (let i = 0; i < unverifiedClaims.length; i += batchSize) {
    const batch = unverifiedClaims.slice(i, i + batchSize);
    
    const claimsWithContext = batch.map((claim) => {
      // Key-metric claims store `raw` as a bare normalized integer
      // (e.g. "4523000"); the source prints it grouped ("4,523,000"), which
      // tokenizes to distinct tokens with no overlap. Build a query in the
      // lexical form present in the source so the figure can be retrieved.
      const lexicalFigure = Number.isFinite(claim.value)
        ? claim.value.toLocaleString("en-US")
        : claim.raw;
      const query = `${claim.label} ${lexicalFigure}`;
      const { relevantChunks } = ragEngine.retrieveContext(query, 3);
      return {
        claim,
        chunks: relevantChunks,
      };
    });

    const retrievedByClaim: Record<string, string[]> = {};
    for (const { claim, chunks: retrieved } of claimsWithContext) {
      retrievedByClaim[claim.id] = retrieved.map((c) => c.id);
    }

    const claimsFormatted = claimsWithContext.map(({ claim, chunks: retrieved }) => {
      const chunksText = retrieved.map((c) => `Chunk [ID: ${c.id}] (Page ${c.pageNumber || "unknown"}):\n${c.text}`).join("\n---\n");
      return `Claim ID: ${claim.id}
Label: ${claim.label}
Claimed Figure/Value: "${claim.raw}" (${claim.value})
Retrieved Chunks:
${chunksText || "No context found."}`;
    }).join("\n====================\n");

    const systemPrompt = `You are a verification assistant for a financial analysis platform.
Your job is to determine whether each claim's numeric figure is supported by the text chunks retrieved from the source document.

Verdicts can be:
- "supported": The numeric value is exactly or directly supported by the context, even if styled/formatted differently.
- "partial": The value is derived from the context (e.g. calculated ratio or rounded sum) but not directly stated.
- "unsupported": The value is completely missing, contradicted, or not supportable by the context.

For each claim in the user prompt, you MUST return a verdict, the ID of the chunk that supports the claim (if supported/partial), and a brief 1-sentence reason.

You MUST respond with a single, valid JSON object following this schema. Do not output markdown, code block formatting, or conversational text.

Schema:
{
  "results": [
    {
      "claimId": "string",
      "verdict": "supported" | "partial" | "unsupported",
      "chunkId": "string",
      "reason": "string"
    }
  ]
}`;

    const userPrompt = `Please verify the following claims against their context:
${claimsFormatted}`;

    try {
      const response = await hfClient.chatCompletion({
        model: "Qwen/Qwen2.5-Coder-32B-Instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const responseText = response.choices?.[0]?.message?.content || "{}";
      const parsed = safeJsonParse(responseText);
      if (parsed && Array.isArray(parsed.results)) {
        for (const item of parsed.results) {
          if (item && typeof item.claimId === "string") {
            results[item.claimId] = {
              claimId: item.claimId,
              verdict: item.verdict || "unsupported",
              chunkId: item.chunkId || "",
              reason: item.reason || "",
              retrievedChunkIds: retrievedByClaim[item.claimId] || [],
            };
          }
        }
      }
    } catch (err: any) {
      console.error("[adjudicator] Batch adjudication failed:", err?.message || err);
      // Fail silently and keep deterministic status
    }
  }

  return results;
}
