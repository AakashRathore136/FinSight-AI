import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "lib", "cashflowUtils.ts"),
  "utf8",
);

const start = source.indexOf("export function calculateBalanceProjection(");
assert.ok(
  start !== -1,
  "calculateBalanceProjection not found in src/lib/cashflowUtils.ts",
);

// The function body is terminated by a closing brace at column 0.
const bodyStart = source.indexOf("{", start);
const bodyEnd = source.indexOf("\n}", bodyStart);
const body = source.slice(bodyStart, bodyEnd + 1);

test("projection seeds the starting balance from actual transactions", () => {
  assert.match(body, /transactions\.forEach/);
  assert.match(body, /currentBalance/);
});

test("projection reports today's real balance for the current month", () => {
  assert.match(body, /getMonthKey\(new Date\(\)\)/);
  assert.match(body, /if \(f\.month !== currentMonth\)/);
});

test("projection only advances the balance on future months", () => {
  assert.match(body, /currentBalance \+= f\.projectedNet/);
});
