import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cmSource = readFileSync(
  path.join(repoRoot, "src", "components", "currency", "CurrencyManager.tsx"),
  "utf8",
);
const cuSource = readFileSync(
  path.join(repoRoot, "src", "lib", "currencyUtils.ts"),
  "utf8",
);

test("CurrencyManager formats the by-currency total with the base currency", () => {
  // The byCurrency totals are already converted to the base currency, so they
  // must be formatted with the base currency code (not the source currency).
  const block = cmSource.slice(
    cmSource.indexOf("Object.entries(aggregated.byCurrency).map"),
    cmSource.indexOf("Object.keys(aggregated.byCurrency).length === 0"),
  );
  assert.match(block, /formatCurrencyDisplay\(total, settings\?\.baseCurrency \|\| 'USD'\)/);
  assert.doesNotMatch(block, /formatCurrencyDisplay\(total, currency\)/);
});

test("CurrencyManager By Currency header notes the conversion to base currency", () => {
  const idx = cmSource.indexOf("By Currency");
  const header = cmSource.slice(idx, idx + 120);
  assert.match(header, /converted to/);
});

test("aggregateMultiCurrencyTotals still returns converted (base) amounts per currency", () => {
  const fnStart = cuSource.indexOf("export function aggregateMultiCurrencyTotals");
  assert.notEqual(fnStart, -1);
  const fnBody = cuSource.slice(fnStart, cuSource.indexOf("return { totalBase, byCurrency }", fnStart) + 40);
  // conversion to base currency must remain the aggregation behaviour
  assert.match(fnBody, /convertAmount\(tx\.amount, tx\.currency, baseCurrency, rates\)/);
  assert.match(fnBody, /byCurrency\[tx\.currency\]/);
});
