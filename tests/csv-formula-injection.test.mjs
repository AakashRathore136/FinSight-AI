import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilsTs = readFileSync(path.join(repoRoot, "src", "lib", "utils.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const reportTs = readFileSync(
  path.join(repoRoot, "src", "lib", "reportUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const forecastTs = readFileSync(
  path.join(repoRoot, "src", "lib", "forecastUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("csvEscape neutralizes formula-injection leading characters", () => {
  const match = utilsTs.match(/export function csvEscape[\s\S]*?\n\}/);
  assert.ok(match, "csvEscape must be exported from src/lib/utils.ts");
  assert.match(
    match[0],
    /\^\[/,
    "csvEscape must detect values starting with =, +, -, or @",
  );
  assert.ok(
    match[0].includes(`"'" + text`),
    "csvEscape must neutralize formulas by prefixing a single quote",
  );
});

test("csvEscape quotes and doubles per RFC 4180", () => {
  const match = utilsTs.match(/export function csvEscape[\s\S]*?\n\}/);
  assert.match(
    match[0],
    /\[",\\r\\n\]/,
    "csvEscape must wrap values containing comma, quote, or newline",
  );
  assert.ok(
    match[0].includes(`text.replace(/"/g, '""')`),
    "csvEscape must double inner double-quotes when quoting",
  );
});

test("generateCSV routes every user field through csvEscape", () => {
  assert.ok(
    reportTs.includes("csvEscape(item.category)"),
    "expense category must be escaped",
  );
  assert.ok(
    reportTs.includes("csvEscape(item.source)"),
    "income source must be escaped",
  );
  assert.ok(
    reportTs.includes("csvEscape(t.description)"),
    "transaction description must be escaped",
  );
  assert.ok(
    reportTs.includes("csvEscape(t.category)"),
    "transaction category must be escaped",
  );
  assert.ok(
    !reportTs.includes('.replace(/,/g, ";")'),
    "comma mangling must not be used in place of proper CSV quoting",
  );
});

test("exportForecastChart routes fields through csvEscape", () => {
  assert.ok(
    forecastTs.includes("csvEscape(d.month)"),
    "forecast export must escape the month label",
  );
  assert.ok(
    forecastTs.includes("csvEscape") && forecastTs.includes("exportForecastChart"),
    "exportForecastChart must use the csvEscape helper",
  );
});
