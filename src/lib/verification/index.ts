import { buildSourceIndex, groundAnalysis } from "./grounding";
import { adjudicateClaims } from "./adjudicator";
import { extractPages, getPageOffsets } from "./extractPages";
import type { GroundingResult, Citation, ClaimStatus } from "./types";
import type { DocumentChunk } from "../rag/textChunker";

export interface GroundingOptions {
  hfClient?: any;
  enableAdjudication?: boolean;
}

/**
 * Orchestrates the full self-verifying document analysis pipeline:
 * 1. Extract page-by-page text from PDF buffer
 * 2. Index the source text and retrieve character offsets
 * 3. Perform deterministic grounding
 * 4. Run model adjudication on unverified claims (if enabled and hfClient is provided)
 */
export async function verifyDocumentAnalysis(
  analysisPayload: any,
  pdfBuffer: Buffer,
  chunks: DocumentChunk[],
  options: GroundingOptions = {}
): Promise<GroundingResult> {
  // 1. Extract pages using unpdf, with fallback to chunks if buffer is empty/invalid
  let pages: string[] = [];
  let fullText = "";
  if (pdfBuffer && pdfBuffer.length > 0) {
    try {
      const extracted = await extractPages(pdfBuffer);
      pages = extracted.pages;
      fullText = extracted.fullText;
    } catch (e: any) {
      console.warn("Failed to extract pages from PDF buffer, reconstructing from chunks:", e?.message || e);
    }
  }

  if (pages.length === 0) {
    const pageGroups: Record<number, string[]> = {};
    for (const chunk of chunks) {
      const p = chunk.pageNumber || 1;
      if (!pageGroups[p]) pageGroups[p] = [];
      pageGroups[p].push(chunk.text);
    }
    const maxPage = Math.max(...Object.keys(pageGroups).map(Number), 1);
    for (let p = 1; p <= maxPage; p++) {
      pages.push((pageGroups[p] || []).join("\n"));
    }
    fullText = pages.join("\n\n\n\n");
  }

  const pageOffsets = getPageOffsets(pages);

  // 2. Build Source Index
  const sourceIndex = buildSourceIndex(fullText, pageOffsets, chunks);

  // 3. Perform deterministic grounding
  const result = groundAnalysis(analysisPayload, sourceIndex);

  // Initialize adjudicated flag
  result.grounding.adjudicated = false;

  // 4. Model Adjudication Pass (if enabled and hfClient is provided)
  const { hfClient, enableAdjudication = true } = options;
  if (hfClient && enableAdjudication) {
    const unverifiedClaims = result.claims.filter((c) => c.status === "unverified");
    if (unverifiedClaims.length > 0) {
      const adjudicationResults = await adjudicateClaims(unverifiedClaims, chunks, hfClient);

      // Apply adjudication updates
      let citationsCount = Object.keys(result.citations).length;
      
      for (const claim of result.claims) {
        if (claim.status !== "unverified") continue;

        const adjudication = adjudicationResults[claim.id];
        if (adjudication && (adjudication.verdict === "supported" || adjudication.verdict === "partial")) {
          const status: ClaimStatus = adjudication.verdict === "supported" ? "verified" : "derived";
          
          claim.status = status;
          claim.reason = adjudication.reason;

          // Find the chunk that supported this claim
          const chunk = chunks.find((c) => c.id === adjudication.chunkId);
          if (chunk) {
            const page = chunk.pageNumber || 1;
            const snippet = chunk.text.slice(0, 240).replace(/\s+/g, " ").trim();
            const charOffset = chunk.charStart || 0;

            const citation: Citation = {
              page,
              chunkId: chunk.id,
              snippet,
              charOffset,
              matchType: "adjudicated",
            };

            claim.citation = citation;

            // Store in citations map if under the limit
            if (citationsCount < 100) {
              result.citations[claim.id] = citation;
              citationsCount++;
            }
          }
        }
      }

      // Re-calculate the grounding summary
      const totalClaims = result.claims.length;
      const count = (status: ClaimStatus) => result.claims.filter((c) => c.status === status).length;
      const verified = count("verified");
      const derived = count("derived");
      const unverified = count("unverified");

      result.grounding = {
        totalClaims,
        verified,
        derived,
        unverified,
        ratio: totalClaims === 0 ? 0 : (verified + derived) / totalClaims,
        adjudicated: true,
        version: 1,
      };
    } else {
      result.grounding.adjudicated = true;
    }
  }

  return result;
}
