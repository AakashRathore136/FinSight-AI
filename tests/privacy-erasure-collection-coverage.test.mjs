import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilsDir = path.join(repoRoot, "src", "lib");
const privacyUtils = readFileSync(path.join(utilsDir, "privacyUtils.ts"), "utf8");

// Collections the app writes/reads that are intentionally handled outside the
// bulk USER_COLLECTIONS sweep in privacyUtils (either keyed differently or
// dedicated singletons/tombstones).
const HANDLED_ELSEWHERE = new Set([
  "activity_log", // activity audit trail, only read in privacyUtils
  "documents", // ownerId-keyed; exported/deleted separately with its analyses subcollection
  "analyses", // ownerId-keyed; exported/deleted separately
  "privacy_settings", // per-user singleton; explicitly deleted in deleteUserData
  "currencies", // per-user singleton; explicitly deleted in deleteUserData
  "users", // deletion tombstone must survive erasure
]);

function extractUserCollections(source) {
  const match = source.match(/const USER_COLLECTIONS = \[([\s\S]*?)\];/);
  assert.ok(match, "USER_COLLECTIONS must be defined in privacyUtils");
  return [...match[1].matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]);
}

function extractCollections(source) {
  const names = new Set();
  for (const m of source.matchAll(/collection\(db,\s*['"]([A-Za-z_]+)['"]\)/g)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/doc\(db,\s*['"]([A-Za-z_]+)['"]/g)) {
    names.add(m[1]);
  }
  return names;
}

function collectUserUtilsCollections() {
  const names = new Set();
  for (const file of readdirSync(utilsDir).filter((f) => f.endsWith("Utils.ts"))) {
    if (file === "privacyUtils.ts") continue;
    const source = readFileSync(path.join(utilsDir, file), "utf8");
    if (!source.includes("userId")) continue; // not a user-keyed module
    for (const name of extractCollections(source)) names.add(name);
  }
  return names;
}

test("USER_COLLECTIONS covers every user-keyed collection the *Utils modules touch", () => {
  const userCollections = new Set(extractUserCollections(privacyUtils));
  const uncovered = [...collectUserUtilsCollections()].filter(
    (name) => !userCollections.has(name) && !HANDLED_ELSEWHERE.has(name),
  );
  assert.deepEqual(
    uncovered,
    [],
    "every user-keyed collection referenced by the *Utils modules must be " +
      "covered by USER_COLLECTIONS or the dedicated handling in privacyUtils",
  );
});

test("USER_COLLECTIONS includes portfolioSnapshots and forecasts", () => {
  const userCollections = extractUserCollections(privacyUtils);
  assert.ok(
    userCollections.includes("portfolioSnapshots"),
    "portfolioSnapshots (written by portfolioUtils) must be exported and deleted",
  );
  assert.ok(
    userCollections.includes("forecasts"),
    "forecasts (written by forecastUtils) must be exported and deleted",
  );
});
