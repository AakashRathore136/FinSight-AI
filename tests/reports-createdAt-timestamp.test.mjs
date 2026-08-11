import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportUtils = readFileSync(
  path.join(repoRoot, "src/lib/reportUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("saveReportToFirestore stores createdAt as a server Timestamp", () => {
  assert.ok(
    reportUtils.includes("createdAt: serverTimestamp(),"),
    "reports.createdAt must be a Firestore Timestamp (serverTimestamp()) to " +
      "match the Timestamp-typed dateRange field",
  );
});

test("reports no longer persist an ISO-string createdAt", () => {
  assert.doesNotMatch(
    reportUtils,
    /createdAt:\s*new Date\(\)\.toISOString\(\)/,
    "saveReportToFirestore must not write an ISO string that diverges from " +
      "the Timestamp dateRange sibling field",
  );
});

test("serverTimestamp is available inside saveReportToFirestore", () => {
  const block = reportUtils.match(
    /export async function saveReportToFirestore[\s\S]*?\n\}/,
  );
  assert.ok(block, "saveReportToFirestore must exist");
  assert.match(
    block[0],
    /serverTimestamp.*import\(["']firebase\/firestore["']\)/,
    "the dynamic firebase import must provide serverTimestamp",
  );
});
