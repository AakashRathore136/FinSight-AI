import { test } from "node:test";
import assert from "node:assert/strict";

const { parseNumber, extractNumbers, inferDecimalConvention, valuesEqual } =
  await import("../src/lib/verification/numberNormalizer.ts");

// Financial documents write the same quantity many ways. Every row here must
// collapse to the same comparable value, or grounding reports false negatives
// on figures that are genuinely present in the source.
const WESTERN_CASES = [
  ["1,234,567", 1234567],
  ["1 234 567".replace(/ /g, " "), 1234567],
  ["12,34,567", 1234567], // Indian lakh/crore grouping
  ["1,234", 1234],
  ["1234", 1234],
  ["1,234.00", 1234],
  ["1234.56", 1234.56],
  ["$4.5M", 4500000],
  ["4.5 million", 4500000],
  ["4.5mn", 4500000],
  ["4.5bn", 4500000000],
  ["4.5 billion", 4500000000],
  ["4.5 crore", 45000000],
  ["45 lakh", 4500000],
  ["2 thousand", 2000],
  ["3k", 3000],
  ["USD 1,234", 1234],
  ["₹1,234", 1234],
  ["£1,234", 1234],
  ["(1,234)", -1234],
  ["-1,234", -1234],
  ["12.5%", 12.5],
];

for (const [input, expected] of WESTERN_CASES) {
  test(`parseNumber reads ${JSON.stringify(input)} as ${expected}`, () => {
    const parsed = parseNumber(input, "western");
    assert.ok(parsed, `expected ${input} to parse`);
    assert.equal(parsed.value, expected);
  });
}

test("european convention flips the separator roles", () => {
  assert.equal(parseNumber("1.234,56", "european").value, 1234.56);
  assert.equal(parseNumber("1.234", "european").value, 1234);
  assert.equal(parseNumber("1.234", "western").value, 1.234);
});

test("percent figures are never scaled", () => {
  const parsed = parseNumber("12.5%", "western");
  assert.equal(parsed.isPercent, true);
  assert.equal(parsed.value, 12.5);
});

test("scale words are recorded alongside the value", () => {
  assert.equal(parseNumber("4.5 crore", "western").scale, "crore");
  assert.equal(parseNumber("1,234", "western").scale, null);
});

test("currency is captured from either side", () => {
  assert.equal(parseNumber("$1,234", "western").currency, "$");
  assert.equal(parseNumber("1,234 USD", "western").currency, "USD");
});

test("a hyphen between two figures is a range, not a negative", () => {
  const found = extractNumbers("revenue grew 10-20 percent", "western");
  const twenty = found.find((n) => Math.abs(n.value) === 20);
  assert.ok(twenty, "expected to find 20");
  assert.equal(twenty.value, 20, "20 in a range must stay positive");
});

test("unit suffixes are not mistaken for scale words", () => {
  assert.equal(parseNumber("5 km", "western").value, 5);
  assert.equal(parseNumber("5 miles", "western").value, 5);
  assert.equal(parseNumber("5 m", "western").value, 5000000);
});

test("malformed input yields null rather than NaN", () => {
  assert.equal(parseNumber("", "western"), null);
  assert.equal(parseNumber("n/a", "western"), null);
  assert.equal(parseNumber("%", "western"), null);
});

test("extractNumbers reports offsets into the source text", () => {
  const text = "Revenue was 4,523,000 for the year.";
  const found = extractNumbers(text, "western");
  assert.equal(found.length, 1);
  assert.equal(found[0].value, 4523000);
  assert.equal(text.slice(found[0].index, found[0].index + 9), "4,523,000");
});

test("extractNumbers does not merge separate figures across a space", () => {
  const found = extractNumbers("items 12 and 34 counted", "western");
  const values = found.map((n) => n.value).sort((a, b) => a - b);
  assert.deepEqual(values, [12, 34]);
});

test("decimal convention is inferred from the document", () => {
  assert.equal(inferDecimalConvention("Total 1,234,567.89 for FY24"), "western");
  assert.equal(inferDecimalConvention("Gesamt 1.234.567,89 im Jahr"), "european");
  assert.equal(inferDecimalConvention(""), "western");
});

test("valuesEqual honours the tolerance ratio", () => {
  assert.equal(valuesEqual(1000, 1000), true);
  assert.equal(valuesEqual(1000, 1004), false);
  assert.equal(valuesEqual(1000, 1004, 0.005), true);
  assert.equal(valuesEqual(4523000, 4520000, 0.005), true);
  assert.equal(valuesEqual(0, 0, 0.005), true);
});
