import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "lib", "forecastUtils.ts"),
  "utf8",
);

const genStart = source.indexOf("export function generateMonthlyForecast(");
assert.ok(genStart !== -1, "generateMonthlyForecast not found in src/lib/forecastUtils.ts");
const genBodyStart = source.indexOf("{", genStart);
const genBodyEnd = source.indexOf("\n}", genBodyStart);
const genBody = source.slice(genBodyStart, genBodyEnd + 1);

test("current partial month is excluded before averaging", () => {
  assert.match(genBody, /const currentMonth = format\(new Date\(\), 'yyyy-MM'\)/);
  assert.match(genBody, /completed\.filter\(\(d\) => d\.month !== currentMonth\)/);
});

test("average divides by the full calendar span, not active-month count", () => {
  // The divisor must be derived from the completed (zero-filled) span.
  assert.match(genBody, /const span = completed\.length/);
  assert.match(genBody, /completed\.reduce/);
  // The raw active-month length must no longer be used as the divisor.
  assert.doesNotMatch(genBody, /\/ historicalData\.length/);
});

const aggStart = source.indexOf("export function aggregateTransactionsByMonth(");
assert.ok(aggStart !== -1, "aggregateTransactionsByMonth not found in src/lib/forecastUtils.ts");
const aggBodyStart = source.indexOf("{", aggStart);
const aggBodyEnd = source.indexOf("\n}", aggBodyStart);
const aggBody = source.slice(aggBodyStart, aggBodyEnd + 1);

test("aggregateTransactionsByMonth zero-fills the observed span", () => {
  assert.match(aggBody, /Zero-fill/);
  assert.match(aggBody, /for \(let idx = startIdx; idx <= endIdx; idx\+\+\)/);
});
