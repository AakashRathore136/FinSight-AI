import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const insightsUtils = readFileSync(path.join(repoRoot, "src/lib/insightsUtils.ts"), "utf8");
const goalUtils = readFileSync(path.join(repoRoot, "src/lib/goalUtils.ts"), "utf8");
const useBaseCurrency = readFileSync(path.join(repoRoot, "src/hooks/useBaseCurrency.ts"), "utf8");

test("insightsUtils.formatCurrency is not hardcoded to USD", () => {
  assert.ok(
    insightsUtils.includes("getDefaultCurrency"),
    "insightsUtils.formatCurrency must fall back to getDefaultCurrency()",
  );
  assert.ok(
    /currency: currency \|\| getDefaultCurrency\(\)/.test(insightsUtils),
    "insightsUtils.formatCurrency must not hardcode currency: \"USD\"",
  );
  assert.ok(
    !/currency: "USD"/.test(insightsUtils),
    "insightsUtils.formatCurrency must not contain a USD literal",
  );
});

test("goalUtils.formatCurrency is not hardcoded to USD", () => {
  assert.ok(
    goalUtils.includes("getDefaultCurrency"),
    "goalUtils.formatCurrency must fall back to getDefaultCurrency()",
  );
  assert.ok(
    /currency: currency \|\| getDefaultCurrency\(\)/.test(goalUtils),
    "goalUtils.formatCurrency must not hardcode currency: \"USD\"",
  );
  assert.ok(
    !/currency: "USD"/.test(goalUtils),
    "goalUtils.formatCurrency must not contain a USD literal",
  );
});

test("useBaseCurrency hook syncs the app-wide default from the user's settings", () => {
  assert.ok(
    /getDoc\(doc\(db, 'currencies', user\.uid\)\)/.test(useBaseCurrency),
    "useBaseCurrency must read the currencies/{uid} settings document",
  );
  assert.ok(
    /setDefaultCurrency\(/.test(useBaseCurrency),
    "useBaseCurrency must call setDefaultCurrency so every formatCurrency uses the base currency",
  );
  assert.ok(
    /\.baseCurrency \|\| 'USD'/.test(useBaseCurrency),
    "useBaseCurrency must fall back to USD when the settings document is missing",
  );
});
