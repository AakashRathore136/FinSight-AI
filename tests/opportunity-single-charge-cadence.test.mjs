import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const insightsUtils = readFileSync(
  path.join(repoRoot, "src/lib/insightsUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("annualizing requires cadence evidence of at least two charges", () => {
  assert.ok(
    insightsUtils.includes("if (sorted.length < 2 || avgInterval < 1) continue;"),
    "identifyOpportunities must skip merchants with fewer than two charges or " +
      "charges bunched within a day",
  );
});

test("chargesPerYear is never a hardcoded 12x fallback", () => {
  assert.doesNotMatch(
    insightsUtils,
    /chargesPerYear = [^;]*: 12/,
    "a single keyword-matched charge must not be annualized at 12x",
  );
  assert.ok(
    insightsUtils.includes("Math.min(52, 365 / Math.max(1, avgInterval))"),
    "chargesPerYear must be derived purely from the measured interval",
  );
});

test("the single-charge keyword path cannot fabricate an annualized claim", () => {
  const block = insightsUtils.match(
    /const chargesPerYear[\s\S]*?annualized = monthly \* chargesPerYear;/,
  );
  assert.ok(block, "annualized must be computed after cadence evidence");
  assert.ok(
    block[0].includes("365 /") && !block[0].includes(": 12"),
    "annualization must use the measured cadence, not a fixed 12",
  );
});
