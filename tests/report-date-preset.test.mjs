import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "components", "reports", "ReportExport.tsx"),
  "utf8",
);

// date-fns endOfDay-equivalent for the test (local-time end of day).
function endOfDay(d) {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function startOfMonth(d) {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfMonth(d) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + 1, 0); // last day of current month
  out.setHours(23, 59, 59, 999);
  return out;
}
function subDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() - n);
  return out;
}

// Replicate the fixed getDateRange logic for boundary assertions.
function getDateRange(preset, customStart, customEnd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "This Month") {
    return { start: startOfMonth(today), end: endOfMonth(today) };
  }
  const endOfToday = endOfDay(today);
  if (preset === "Last 3 Months") {
    const start = startOfMonth(subDays(today, 90));
    return { start, end: endOfToday };
  }
  if (preset === "Custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  const days = preset === "Last 7 Days" ? 7 : 30;
  return { start: subDays(today, days), end: endOfToday };
}

test("Last 30 Days end boundary is end-of-day (includes today)", () => {
  const { end } = getDateRange("Last 30 Days");
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getSeconds(), 59);
  assert.equal(end.getMilliseconds(), 999);
});

test("Last 7 Days end boundary is end-of-day (includes today)", () => {
  const { end } = getDateRange("Last 7 Days");
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMilliseconds(), 999);
});

test("Last 3 Months end boundary is end-of-day (includes today)", () => {
  const { end } = getDateRange("Last 3 Months");
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMilliseconds(), 999);
});

test("This Month already uses endOfMonth (no regression)", () => {
  const { end } = getDateRange("This Month");
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMilliseconds(), 999);
});

test("Custom preset is untouched (caller controls the boundary)", () => {
  const cs = new Date(2025, 0, 1, 0, 0, 0, 0);
  const ce = new Date(2025, 0, 15, 0, 0, 0, 0);
  const { start, end } = getDateRange("Custom", cs, ce);
  assert.equal(start.getTime(), cs.getTime());
  assert.equal(end.getTime(), ce.getTime());
});

test("source: getDateRange uses endOfDay for the preset end bounds", () => {
  const fnStart = source.indexOf("function getDateRange");
  assert.notEqual(fnStart, -1, "getDateRange not found");
  const fnBody = source.slice(fnStart, source.indexOf("export function ReportExport", fnStart));
  assert.match(fnBody, /endOfDay/);
  // The "Last 3 Months" and the default return must use endOfToday, not bare today.
  assert.match(fnBody, /return \{ start, end: endOfToday \}/);
  assert.match(fnBody, /return \{ start: subDays\(today, days\), end: endOfToday \}/);
});

test("source: imports endOfDay from date-fns", () => {
  assert.match(source, /import \{[^}]*endOfDay[^}]*\} from ["']date-fns["']/);
});
