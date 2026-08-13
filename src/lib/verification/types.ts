/**
 * Shared types for the document grounding layer.
 *
 * Grounding checks that every figure the model reports actually appears in the
 * uploaded document, so an analysis can distinguish a quoted number from an
 * invented one.
 */

/** How strongly a claim is tied back to the source document. */
export type ClaimStatus =
  /** The figure was located in the source text. */
  | "verified"
  /** Close to a source figure but not identical — typically a computed ratio. */
  | "derived"
  /** Not found in the source text. */
  | "unverified";

/** How the match was made, in decreasing order of strength. */
/** How the match was made, in decreasing order of strength. */
export type MatchType = "exact" | "normalized" | "tolerance" | "adjudicated";

/** Where in the document a claim was found. */
export interface Citation {
  /** 1-based page number. */
  page: number;
  /** Id of the chunk containing the match, or "" when chunking is unavailable. */
  chunkId: string;
  /** Short excerpt of surrounding source text. */
  snippet: string;
  /** Character offset into the document's full text. */
  charOffset: number;
  matchType: MatchType;
}

/** A single numeric assertion pulled out of the model's analysis. */
export interface GroundedClaim {
  /** Stable id used as the key in the citations map. */
  id: string;
  /** Where the claim came from, e.g. "key_metrics.revenue" or "summary". */
  label: string;
  /** The figure exactly as the model wrote it. */
  raw: string;
  /** Canonical numeric value of `raw`. */
  value: number;
  status: ClaimStatus;
  citation?: Citation;
  reason?: string; // Optional reasoning from adjudication
}

/** Aggregate grounding outcome for one analysis. */
export interface GroundingSummary {
  totalClaims: number;
  verified: number;
  derived: number;
  unverified: number;
  /** verified / totalClaims, 0..1. 0 when there are no claims. */
  ratio: number;
  /** Whether the model-based adjudication pass was executed. */
  adjudicated: boolean;
  /** Schema version, so stored records can be migrated later. */
  version: 1;
}

/** Full result of grounding one analysis payload. */
export interface GroundingResult {
  /** claim id -> citation, for claims that were located. */
  citations: Record<string, Citation>;
  claims: GroundedClaim[];
  grounding: GroundingSummary;
}

/**
 * Which separator a document uses for decimals.
 * "western" -> 1,234.56   "european" -> 1.234,56
 */
export type DecimalConvention = "western" | "european";

/** A number parsed out of text, with its formatting resolved. */
export interface NormalizedNumber {
  /** The token exactly as it appeared. */
  raw: string;
  /** Canonical value, with scale words applied and negatives signed. */
  value: number;
  /** Scale word that was applied ("million", "crore", ...), if any. */
  scale: string | null;
  isPercent: boolean;
  isNegative: boolean;
  /** Currency symbol or ISO code found next to the number, if any. */
  currency: string | null;
}

/** A number located at a known position in the source text. */
export interface LocatedNumber extends NormalizedNumber {
  /** Character offset of the token within the full text. */
  index: number;
}
