import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firestoreRules = readFileSync(
  path.join(repoRoot, "firestore.rules"),
  "utf8",
).replace(/\r\n/g, "\n");

function matchCount(source, regex) {
  return (source.match(regex) || []).length;
}

test("no collection has duplicate match blocks at the same level", () => {
  for (const collection of [
    "reports",
    "privacy_settings",
    "currencies",
    "transactions",
    "anomalies",
  ]) {
    const count = matchCount(
      firestoreRules,
      new RegExp(`match /${collection}/{`, "g"),
    );
    assert.equal(
      count,
      1,
      `match /${collection}/... must appear exactly once — duplicate blocks ` +
        "OR-combine and silently nullify stricter allow clauses",
    );
  }
});

test("reports is append-only: allow update: if false is genuinely enforced", () => {
  const reportsBlock = firestoreRules.match(
    /match \/reports\/\{reportId\} \{[\s\S]*?\n    \}/,
  )?.[0];
  assert.ok(reportsBlock, "reports match block must exist");
  assert.match(
    reportsBlock,
    /allow update: if false/,
    "reports updates must be blocked so the append-only intent is not dead code",
  );
  assert.doesNotMatch(
    reportsBlock,
    /allow update: if isOwner\(existing\(\)\.userId\)/,
    "the owner-update rule must not coexist with the append-only rule in the same block",
  );
});

test("userId immutability on update uses an explicit affectedKeys check", () => {
  assert.ok(
    firestoreRules.includes(
      "!incoming().diff(existing()).affectedKeys().hasAny(['userId'])",
    ),
    "the preservesOwnerKey helper must reject updates that alter the userId key",
  );
  assert.doesNotMatch(
    firestoreRules,
    /incoming\(\)\.userId == existing\(\)\.userId/,
    "bare userId equality checks must be replaced by the affectedKeys() helper",
  );
});
