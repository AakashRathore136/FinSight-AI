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
const dashboard = readFileSync(
  path.join(repoRoot, "src/components/insights/InsightsDashboard.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("generatePlainSummary accepts an optional currency argument", () => {
  assert.ok(
    /export function generatePlainSummary\(summary: PeriodSummary, currency\?: string\): string/.test(
      insightsUtils,
    ),
    "generatePlainSummary must accept an optional `currency?: string` parameter",
  );
});

test("generatePlainSummary threads currency into formatCurrency calls", () => {
  assert.ok(
    /formatCurrency\(summary\.total, currency\)/.test(insightsUtils),
    "the total figure must be formatted with the passed currency",
  );
  assert.ok(
    /formatCurrency\(top\.total, currency\)/.test(insightsUtils),
    "the top-category figure must be formatted with the passed currency",
  );
});

test("InsightsDashboard passes baseCurrency into generatePlainSummary", () => {
  assert.ok(
    /generatePlainSummary\(weeklySummary, baseCurrency\)/.test(dashboard),
    "weekly section must pass baseCurrency to generatePlainSummary",
  );
  assert.ok(
    /generatePlainSummary\(monthlySummary, baseCurrency\)/.test(dashboard),
    "monthly section must pass baseCurrency to generatePlainSummary",
  );
});

