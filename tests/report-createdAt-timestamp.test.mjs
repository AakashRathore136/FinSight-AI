import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "lib", "reportUtils.ts"),
  "utf8",
);

test("saveReportToFirestore writes createdAt as a Firestore Timestamp, not an ISO string", () => {
  const fnStart = source.indexOf("export async function saveReportToFirestore");
  assert.notEqual(fnStart, -1, "saveReportToFirestore not found");
  const fnBody = source.slice(fnStart);

  // createdAt must use serverTimestamp() (a Firestore Timestamp), matching
  // dateRange's Timestamp.fromDate and the other writers in this repo.
  assert.match(fnBody, /createdAt:\s*serverTimestamp\(\)/);
  assert.doesNotMatch(
    fnBody,
    /createdAt:\s*new Date\(\)\.toISOString\(\)/,
    "createdAt must not be written as an ISO string",
  );

  // serverTimestamp must be imported in the dynamic import block.
  assert.match(fnBody, /serverTimestamp/);
  // dateRange must remain Timestamps (the consistent type we're matching).
  assert.match(fnBody, /start:\s*Timestamp\.fromDate/);
  assert.match(fnBody, /end:\s*Timestamp\.fromDate/);
});

test("reportUtils keeps the static report builder's createdAt as a Date at the TS level", () => {
  // The ReportData interface declares createdAt: Date and the in-memory builder
  // (createReportData) sets createdAt: new Date() — that's the correct local
  // type. Only the Firestore write must normalize to a Timestamp.
  assert.match(source, /createdAt:\s*Date;/);
  const createStart = source.indexOf("createdAt: new Date()");
  // The in-memory Date usage is allowed; only the Firestore payload must not
  // use toISOString(). We already assert that above.
  assert.notEqual(createStart, -1);
});
