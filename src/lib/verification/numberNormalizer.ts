/**
 * Parses financial figures out of text into comparable numeric values.
 *
 * Financial documents write the same quantity many ways — "$4.5M", "4,500,000",
 * "45 lakh", "(1,234)" for a negative, "1.234,56" in European format. Grounding
 * a model's claim against the source means comparing values, not strings, so
 * every one of those forms has to collapse to the same number.
 */

import type {
  DecimalConvention,
  LocatedNumber,
  NormalizedNumber,
} from "./types";

/** Multipliers for scale words, keyed by their normalized lowercase form. */
const SCALE_FACTORS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  million: 1e6,
  mn: 1e6,
  m: 1e6,
  crore: 1e7,
  crores: 1e7,
  cr: 1e7,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
  tn: 1e12,
  t: 1e12,
};

/**
 * Longest-first alternation so "million" wins over "mn" over "m". Single
 * letters require a word boundary, which keeps "5 km" and "5 miles" from being
 * read as scale words.
 */
const SCALE_PATTERN =
  "(?:thousand|million|billion|trillion|crores?|lakhs?|lacs?|mn|bn|tn|cr|[kmbt])";

const CURRENCY_PATTERN =
  "(?:USD|EUR|GBP|INR|JPY|AUD|CAD|CHF|CNY|Rs\\.?|₹|\\$|€|£|¥)";

/**
 * Separators that only ever group digits: non-breaking space, narrow no-break
 * space, and the Swiss apostrophe. A plain space is deliberately excluded —
 * treating it as a separator would merge "12 and 34" into one figure.
 */
const NEUTRAL_SEPARATORS = /[  ']/g;

/**
 * A run of digits that may contain grouping separators or a decimal point.
 * Anchored on digits at both ends so trailing punctuation is left out.
 */
const NUMERIC_CORE_SOURCE = "\\d[\\d,.\\u00A0\\u202F']*\\d|\\d";

const SCALE_AFTER = new RegExp(`^\\s*${SCALE_PATTERN}\\b`, "i");
const PERCENT_AFTER = /^\s*(?:%|per\s?cent)/i;
const CURRENCY_BEFORE = new RegExp(`${CURRENCY_PATTERN}\\s*$`, "i");
const CURRENCY_AFTER = new RegExp(`^\\s*${CURRENCY_PATTERN}\\b`, "i");
const OPEN_PAREN_BEFORE = new RegExp(
  `\\(\\s*(?:${CURRENCY_PATTERN}\\s*)?$`,
  "i",
);
const CLOSE_PAREN_AFTER = /^\s*\)/;
/**
 * A minus sign that negates rather than subtracts or hyphenates: it must be
 * preceded by the start of the window, whitespace, or an opening delimiter.
 * This keeps the "20" in "10-20" positive.
 */
const NEGATIVE_BEFORE = /(?:^|[\s([{:=,])-\s*$/;

/** How far to look on either side of a digit run for context. */
const CONTEXT_WINDOW = 20;

/**
 * Guesses whether a document writes decimals with "." or ",".
 *
 * Counts only unambiguous evidence: a separator followed by exactly three
 * digits is grouping, one followed by one or two digits is a decimal point.
 * Documents are assumed internally consistent, so a single inference is applied
 * to the whole text rather than guessing per token.
 */
export function inferDecimalConvention(text: string): DecimalConvention {
  if (!text) return "western";

  const westernGrouping = (text.match(/\d,\d{3}(?!\d)/g) || []).length;
  const europeanGrouping = (text.match(/\d\.\d{3}(?!\d)/g) || []).length;
  const westernDecimal = (text.match(/\d\.\d{1,2}(?!\d)/g) || []).length;
  const europeanDecimal = (text.match(/\d,\d{1,2}(?!\d)/g) || []).length;

  const westernScore = westernGrouping + westernDecimal;
  const europeanScore = europeanGrouping + europeanDecimal;

  // Ties fall to western, which is what BFSI documents in this product's
  // markets (US, UK, India) overwhelmingly use.
  return europeanScore > westernScore ? "european" : "western";
}

function replaceLast(
  input: string,
  search: string,
  replacement: string,
): string {
  const idx = input.lastIndexOf(search);
  if (idx === -1) return input;
  return input.slice(0, idx) + replacement + input.slice(idx + search.length);
}

/**
 * Resolves grouping separators and returns the bare numeric value.
 * Returns NaN when the token cannot be read as a number.
 */
function interpretSeparators(
  core: string,
  convention: DecimalConvention,
): number {
  const cleaned = core.replace(NEUTRAL_SEPARATORS, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;

  if (hasComma && hasDot) {
    // Whichever appears last is the decimal point; the other groups digits.
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = replaceLast(cleaned.replace(/\./g, ""), ",", ".").replace(
        /,/g,
        "",
      );
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = cleaned.split(",");
    const tail = parts[parts.length - 1];
    if (parts.length > 2) {
      // 1,234,567 or the Indian 12,34,567 — grouping either way.
      normalized = cleaned.replace(/,/g, "");
    } else if (tail.length === 3) {
      // "1,234" is ambiguous; the document's convention decides.
      normalized =
        convention === "european"
          ? cleaned.replace(",", ".")
          : cleaned.replace(/,/g, "");
    } else {
      // A comma followed by one or two digits is a decimal point either way.
      normalized = cleaned.replace(",", ".");
    }
  } else if (hasDot) {
    const parts = cleaned.split(".");
    const tail = parts[parts.length - 1];
    if (parts.length > 2) {
      // 1.234.567 can only be european grouping.
      normalized = cleaned.replace(/\./g, "");
    } else if (tail.length === 3 && convention === "european") {
      normalized = cleaned.replace(/\./g, "");
    }
    // Otherwise the dot is already a decimal point.
  }

  return normalized === "" ? NaN : Number(normalized);
}

/** Normalizes a scale word to its map key ("Crores" -> "crores"). */
function scaleFactorFor(word: string): { key: string; factor: number } | null {
  const key = word.trim().toLowerCase().replace(/\./g, "");
  const factor = SCALE_FACTORS[key];
  return factor === undefined ? null : { key, factor };
}

/**
 * Turns a digit run plus its surrounding context into a normalized value.
 * `before` and `after` are the raw text on either side of `core`.
 */
function buildNumber(
  core: string,
  before: string,
  after: string,
  convention: DecimalConvention,
): NormalizedNumber | null {
  const base = interpretSeparators(core, convention);
  if (!Number.isFinite(base)) return null;

  const isPercent = PERCENT_AFTER.test(after);

  let scale: string | null = null;
  let factor = 1;
  if (!isPercent) {
    const scaleMatch = after.match(SCALE_AFTER);
    if (scaleMatch) {
      const resolved = scaleFactorFor(scaleMatch[0]);
      if (resolved) {
        scale = resolved.key;
        factor = resolved.factor;
      }
    }
  }

  const parenthesized =
    OPEN_PAREN_BEFORE.test(before) && CLOSE_PAREN_AFTER.test(after);
  const isNegative = parenthesized || NEGATIVE_BEFORE.test(before);

  const currencyMatch =
    before.match(CURRENCY_BEFORE) || after.match(CURRENCY_AFTER);
  const currency = currencyMatch ? currencyMatch[0].trim() : null;

  const magnitude = base * factor;

  return {
    raw: core,
    value: isNegative ? -magnitude : magnitude,
    scale,
    isPercent,
    isNegative,
    currency,
  };
}

/**
 * Reads a single figure, including any currency, sign, scale word or percent
 * sign attached to it. Returns null when `raw` holds no digits.
 */
export function parseNumber(
  raw: string,
  convention: DecimalConvention = "western",
): NormalizedNumber | null {
  if (!raw) return null;

  const pattern = new RegExp(NUMERIC_CORE_SOURCE, "g");
  const match = pattern.exec(raw);
  if (!match) return null;

  const core = match[0];
  const start = match.index;
  const end = start + core.length;

  const parsed = buildNumber(
    core,
    raw.slice(0, start),
    raw.slice(end),
    convention,
  );
  if (!parsed) return null;

  return { ...parsed, raw: raw.trim() };
}

/**
 * Finds every figure in a block of text, with its character offset.
 *
 * Offsets are relative to `text` as passed in, so callers can map a match back
 * to a page or chunk.
 */
export function extractNumbers(
  text: string,
  convention: DecimalConvention = "western",
): LocatedNumber[] {
  if (!text) return [];

  const results: LocatedNumber[] = [];
  const pattern = new RegExp(NUMERIC_CORE_SOURCE, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const core = match[0];
    const start = match.index;
    const end = start + core.length;

    const parsed = buildNumber(
      core,
      text.slice(Math.max(0, start - CONTEXT_WINDOW), start),
      text.slice(end, end + CONTEXT_WINDOW),
      convention,
    );

    if (parsed) {
      results.push({ ...parsed, index: start });
    }
  }

  return results;
}

/**
 * True when two figures should be treated as the same number.
 *
 * `toleranceRatio` of 0 demands exact equality; a small positive value absorbs
 * the rounding a report applies when it restates a figure ("4.52 million" for
 * 4,523,000).
 */
export function valuesEqual(a: number, b: number, toleranceRatio = 0): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  if (toleranceRatio <= 0) return false;

  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return false;
  return Math.abs(a - b) / scale <= toleranceRatio;
}
