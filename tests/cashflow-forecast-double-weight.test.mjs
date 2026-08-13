import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "lib", "cashflowUtils.ts"),
  "utf8",
);

const start = source.indexOf("export function calculateMonthlyForecast(");
assert.ok(start !== -1, "calculateMonthlyForecast not found in src/lib/cashflowUtils.ts");

const bodyStart = source.indexOf("{", start);
const bodyEnd = source.indexOf("\n}", bodyStart);
const body = source.slice(bodyStart, bodyEnd + 1);

test("current month is excluded from the averaging numerator", () => {
  assert.match(body, /const currentMonth = getMonthKey\(new Date\(\)\)/);
  assert.match(body, /if \(monthKey === currentMonth\) return;/);
});

test("forecast no longer depends on now.getDate() (deterministic)", () => {
  assert.doesNotMatch(body, /currentMonthWeight/);
  assert.doesNotMatch(body, /elapsedDays/);
  assert.doesNotMatch(body, /now\.getDate\(\)/);
});

test("divisor is the count of completed months", () => {
  assert.match(body, /const divisor = Math\.max\(windowMonths - 1, 1\);/);
});
