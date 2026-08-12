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

const start = source.indexOf("function detectFrequency(dates: Date[])");
assert.ok(
  start !== -1,
  "detectFrequency not found in src/lib/cashflowUtils.ts",
);

const bodyStart = source.indexOf("{", start);
const bodyEnd = source.lastIndexOf("}", source.length);
const body = source.slice(bodyStart, bodyEnd + 1);

test("detectFrequency returns quarterly for median gap near 91 days", () => {
  assert.match(body, /quarterly/);
  assert.match(body, /91/);
  assert.match(body, /Math\.abs\(median.*91\)/);
});

test("detectFrequency has explicit quarterly check before monthly fallback", () => {
  const quarterlyIdx = body.indexOf("quarterly");
  const monthlyIdx = body.lastIndexOf("monthly");
  assert.ok(
    quarterlyIdx !== -1 && quarterlyIdx < monthlyIdx,
    "quarterly check should appear before monthly fallback in detectFrequency",
  );
});

test("detectFrequency accepts quarterly in its return type union", () => {
  assert.match(source, /detectFrequency.*:.*"weekly".*"monthly".*"quarterly"/);
});
