/**
 * Checks the figures in an analysis against the document they came from.
 *
 * The model is asked to extract metrics; this module decides, for each figure
 * it reported, whether that figure actually appears in the source text. A
 * number that cannot be located is surfaced as unverified rather than silently
 * presented as fact.
 *
 * Matching is deterministic on purpose. The project's vector store scores
 * similarity over term frequencies, which ranks passages but cannot answer
 * "does this exact figure occur here" — two unrelated amounts sharing digit
 * groups score as similar, and a rare figure carries no more weight than a
 * common word. String and value comparison answers that question exactly.
 */

import type { DocumentChunk } from "../rag/textChunker";
import {
  extractNumbers,
  inferDecimalConvention,
  parseNumber,
  valuesEqual,
} from "./numberNormalizer";
import type {
  Citation,
  ClaimStatus,
  DecimalConvention,
  GroundedClaim,
  GroundingResult,
  GroundingSummary,
  LocatedNumber,
} from "./types";

/**
 * How far a figure may sit from a source number and still count as derived.
 * Reports routinely restate "4,523,000" as "4.52 million"; at 0.5% that
 * rounding matches, while a genuinely different figure does not.
 */
export const DERIVED_TOLERANCE = 0.005;

/** Characters of source text kept on each side of a match. */
const SNIPPET_RADIUS = 120;

/** Guard against pathological nesting in model-supplied metrics. */
const MAX_METRIC_DEPTH = 4;

/** Cap on stored citations, to stay clear of Firestore's 1 MiB document limit. */
export const MAX_CITATIONS = 100;

/** The document, indexed for lookup. */
export interface SourceIndex {
  fullText: string;
  convention: DecimalConvention;
  /** Every figure in the document, in order of appearance. */
  numbers: LocatedNumber[];
  /** Ascending unique values, for nearest-value search. */
  sortedValues: number[];
  /** Canonical value -> character offsets where it occurs. */
  byValue: Map<number, number[]>;
  /** Character offset at which each page starts. */
  pageOffsets: number[];
  chunks: DocumentChunk[];
}

/** The parts of an analysis payload that grounding reads. */
export interface GroundableAnalysis {
  key_metrics?: Record<string, unknown>;
  summary?: string;
  full_report?: string;
}

/**
 * Indexes a document's text so claims can be looked up by value.
 *
 * Building this once is what keeps grounding linear: every claim is then an
 * O(1) map hit or an O(log n) binary search rather than a scan.
 */
export function buildSourceIndex(
  fullText: string,
  pageOffsets: number[] = [0],
  chunks: DocumentChunk[] = [],
): SourceIndex {
  const convention = inferDecimalConvention(fullText);
  const numbers = extractNumbers(fullText, convention);

  const byValue = new Map<number, number[]>();
  for (const num of numbers) {
    const existing = byValue.get(num.value);
    if (existing) existing.push(num.index);
    else byValue.set(num.value, [num.index]);
  }

  const sortedValues = Array.from(byValue.keys()).sort((a, b) => a - b);

  return {
    fullText,
    convention,
    numbers,
    sortedValues,
    byValue,
    pageOffsets: pageOffsets.length ? pageOffsets : [0],
    chunks,
  };
}

/** 1-based page number containing `offset`. */
export function pageForOffset(index: SourceIndex, offset: number): number {
  const { pageOffsets } = index;
  let low = 0;
  let high = pageOffsets.length - 1;
  let page = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pageOffsets[mid] <= offset) {
      page = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return page + 1;
}

/** Id of the chunk containing `offset`, or "" when chunk spans are unknown. */
function chunkIdForOffset(index: SourceIndex, offset: number): string {
  for (const chunk of index.chunks) {
    if (
      typeof chunk.charStart === "number" &&
      typeof chunk.charEnd === "number" &&
      offset >= chunk.charStart &&
      offset < chunk.charEnd
    ) {
      return chunk.id;
    }
  }
  return "";
}

/** Source text around a match, with whitespace collapsed for display. */
function snippetAt(index: SourceIndex, offset: number): string {
  const start = Math.max(0, offset - SNIPPET_RADIUS);
  const end = Math.min(index.fullText.length, offset + SNIPPET_RADIUS);
  return index.fullText.slice(start, end).replace(/\s+/g, " ").trim();
}

function citationAt(
  index: SourceIndex,
  offset: number,
  matchType: Citation["matchType"],
): Citation {
  return {
    page: pageForOffset(index, offset),
    chunkId: chunkIdForOffset(index, offset),
    snippet: snippetAt(index, offset),
    charOffset: offset,
    matchType,
  };
}

/** Nearest indexed value to `value`, via binary search over sorted values. */
function nearestValue(index: SourceIndex, value: number): number | null {
  const values = index.sortedValues;
  if (!values.length) return null;

  let low = 0;
  let high = values.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (values[mid] === value) return values[mid];
    if (values[mid] < value) low = mid + 1;
    else high = mid - 1;
  }

  const candidates = [values[high], values[low]].filter(
    (v) => v !== undefined,
  ) as number[];
  if (!candidates.length) return null;

  return candidates.reduce((best, current) =>
    Math.abs(current - value) < Math.abs(best - value) ? current : best,
  );
}

const DIGIT_BOUNDARY = /[\d.,]/;

/**
 * Finds the first verbatim occurrence of `literal` in `index.fullText` that is
 * word-bounded on both sides and whose surrounding figure parses to the same
 * value as `claimValue`. A bare substring match (e.g. "50" inside "1500") is
 * rejected so scaled figures are not false-verified against the wrong number.
 *
 * Returns the character offset of the match, or -1 when none qualifies.
 */
function findVerbatimMatch(
  index: SourceIndex,
  literal: string,
  claimValue: number,
): number {
  let at = index.fullText.indexOf(literal);
  while (at !== -1) {
    const before = index.fullText[at - 1] ?? "";
    const after = index.fullText[at + literal.length] ?? "";

    const boundedBefore = !before || !DIGIT_BOUNDARY.test(before);
    const boundedAfter = !after || !DIGIT_BOUNDARY.test(after);

    if (boundedBefore && boundedAfter) {
      // Value-consistency: parse the figure around the match and require it to
      // equal the claim value, so "50" does not verify a "50 million" claim.
      const windowStart = Math.max(0, at - 20);
      const windowEnd = Math.min(index.fullText.length, at + literal.length + 20);
      const parsed = parseNumber(
        index.fullText.slice(windowStart, windowEnd),
        index.convention,
      );
      if (parsed && valuesEqual(parsed.value, claimValue)) {
        return at;
      }
    }

    at = index.fullText.indexOf(literal, at + literal.length);
  }
  return -1;
}

/**
 * Decides whether a single claim is supported by the document.
 *
 * Three tiers are tried in decreasing order of strength: the figure appears
 * verbatim; some figure in the document has the same value once formatting is
 * normalized; or a figure sits within the derived tolerance, which is how a
 * computed ratio or a rounded restatement shows up.
 */
export function groundClaim(
  claim: Omit<GroundedClaim, "status" | "citation">,
  index: SourceIndex,
): GroundedClaim {
  const literal = claim.raw.trim();

  if (literal) {
    const exactOffset = findVerbatimMatch(index, literal, claim.value);
    if (exactOffset !== -1) {
      return {
        ...claim,
        status: "verified",
        citation: citationAt(index, exactOffset, "exact"),
      };
    }
  }

  const sameValue = index.byValue.get(claim.value);
  if (sameValue && sameValue.length) {
    return {
      ...claim,
      status: "verified",
      citation: citationAt(index, sameValue[0], "normalized"),
    };
  }

  const nearest = nearestValue(index, claim.value);
  if (nearest !== null && valuesEqual(nearest, claim.value, DERIVED_TOLERANCE)) {
    const offsets = index.byValue.get(nearest);
    if (offsets && offsets.length) {
      return {
        ...claim,
        status: "derived",
        citation: citationAt(index, offsets[0], "tolerance"),
      };
    }
  }

  return { ...claim, status: "unverified" };
}

/**
 * Figures in prose that are almost never financial claims.
 *
 * Years and small counts ("3 key risks") would otherwise dominate the
 * denominator and drag the grounding ratio around for no useful reason. Metrics
 * the model explicitly extracted are never filtered — those are always claims.
 */
function isLikelyFinancialFigure(num: LocatedNumber): boolean {
  if (num.currency || num.scale || num.isPercent) return true;

  const magnitude = Math.abs(num.value);
  if (Number.isInteger(magnitude)) {
    if (magnitude >= 1900 && magnitude <= 2100) return false; // a year
    if (magnitude <= 12) return false; // list counts, months
  }

  return true;
}

/** Walks model-supplied metrics, yielding every numeric leaf. */
function collectMetricClaims(
  value: unknown,
  path: string,
  convention: DecimalConvention,
  out: Omit<GroundedClaim, "status" | "citation">[],
  depth = 0,
): void {
  if (depth > MAX_METRIC_DEPTH || value === null || value === undefined) return;

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      out.push({
        id: `m${out.length}`,
        label: path,
        raw: String(value),
        value,
      });
    }
    return;
  }

  if (typeof value === "string") {
    const parsed = parseNumber(value, convention);
    if (parsed) {
      out.push({
        id: `m${out.length}`,
        label: path,
        raw: parsed.raw,
        value: parsed.value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectMetricClaims(item, `${path}[${i}]`, convention, out, depth + 1),
    );
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectMetricClaims(
        child,
        path ? `${path}.${key}` : key,
        convention,
        out,
        depth + 1,
      );
    }
  }
}

/**
 * Pulls every checkable figure out of an analysis payload.
 *
 * Both the structured metrics and the figures embedded in prose are collected —
 * prose figures are the higher risk of the two, since they read as fact and are
 * never surfaced as structured data.
 */
export function extractClaims(
  analysis: GroundableAnalysis,
  convention: DecimalConvention,
): Omit<GroundedClaim, "status" | "citation">[] {
  const claims: Omit<GroundedClaim, "status" | "citation">[] = [];

  if (analysis.key_metrics && typeof analysis.key_metrics === "object") {
    collectMetricClaims(analysis.key_metrics, "key_metrics", convention, claims);
  }

  const proseFields: Array<[string, string | undefined]> = [
    ["summary", analysis.summary],
    ["full_report", analysis.full_report],
  ];

  for (const [field, text] of proseFields) {
    if (!text) continue;
    for (const num of extractNumbers(text, convention)) {
      if (!isLikelyFinancialFigure(num)) continue;
      claims.push({
        id: `p${claims.length}`,
        label: field,
        raw: num.raw,
        value: num.value,
      });
    }
  }

  return claims;
}

function summarize(claims: GroundedClaim[]): GroundingSummary {
  const count = (status: ClaimStatus) =>
    claims.filter((c) => c.status === status).length;

  const verified = count("verified");
  const derived = count("derived");
  const unverified = count("unverified");
  const totalClaims = claims.length;

  return {
    totalClaims,
    verified,
    derived,
    unverified,
    ratio: totalClaims === 0 ? 0 : verified / totalClaims,
    adjudicated: false,
    version: 1,
  };
}

/**
 * Grounds a whole analysis payload against its source document.
 *
 * Pure and synchronous — no model call, no network. Callers persist the result
 * alongside the analysis.
 */
export function groundAnalysis(
  analysis: GroundableAnalysis,
  index: SourceIndex,
): GroundingResult {
  const claims = extractClaims(analysis, index.convention).map((claim) =>
    groundClaim(claim, index),
  );

  const citations: Record<string, Citation> = {};
  let stored = 0;
  for (const claim of claims) {
    if (!claim.citation) continue;
    if (stored >= MAX_CITATIONS) break;
    citations[claim.id] = claim.citation;
    stored += 1;
  }

  return { citations, claims, grounding: summarize(claims) };
}
