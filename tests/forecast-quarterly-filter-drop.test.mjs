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

const start = source.indexOf("export function applyFilters(");
assert.ok(start !== -1, "applyFilters not found in src/lib/forecastUtils.ts");

const bodyStart = source.indexOf("{", start);
const bodyEnd = source.indexOf("\n}", bodyStart);
const body = source.slice(bodyStart, bodyEnd + 1);

test("quarterly entries are tested for overlap, not point-in-time month", () => {
  assert.match(body, /intervalsOverlap/);
});

test("quarter overlap uses the full quarter span (first month -> last month)", () => {
  assert.match(body, /const quarterStart = new Date\(y, m - 1, 1\)/);
  assert.match(body, /const quarterEnd = new Date\(y, m - 1 \+ 3, 0\)/);
});

test("quarter detection is based on the quarter field, monthly falls through", () => {
  assert.match(body, /quarter/);
  assert.match(body, /d\.month\.split\('-'\)\.map\(Number\)/);
  assert.match(body, /isWithinInterval\(monthDate, \{ start, end \}\)/);
});
