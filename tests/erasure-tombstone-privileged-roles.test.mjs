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
const privacyUtils = readFileSync(
  path.join(repoRoot, "src/lib/privacyUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("rules define a dedicated tombstone validator for account erasure", () => {
  assert.match(
    firestoreRules,
    /function isValidTombstone\(data\)/,
    "a dedicated isValidTombstone helper must exist",
  );
  assert.ok(
    firestoreRules.includes("data.role == 'junior_analyst'"),
    "tombstone must carry the default non-privileged role",
  );
  assert.ok(
    firestoreRules.includes("data.deleted == true"),
    "tombstone must require deleted == true",
  );
  assert.ok(
    firestoreRules.includes("data.uid == request.auth.uid"),
    "tombstone must be bound to the caller's own uid",
  );
  assert.ok(
    firestoreRules.includes("data.deletedAt is string"),
    "tombstone must accept the ISO-string deletedAt written by deleteUserData",
  );
});

test("users create allows the tombstone path for privileged-role erasure", () => {
  const match = firestoreRules.match(/allow create:[\s\S]*?;/);
  assert.ok(match, "users create rule must exist");
  assert.ok(
    match[0].includes("isValidTombstone(incoming())"),
    "users create must OR in the tombstone path so senior_pm/cro/compliance " +
      "erasure is not blocked by the strict profile gate",
  );
});

test("deleteUserData writes a tombstone that satisfies isValidTombstone", () => {
  assert.ok(
    privacyUtils.includes("role: DEFAULT_ROLE"),
    "tombstone must always use DEFAULT_ROLE regardless of prior role",
  );
  assert.ok(
    privacyUtils.includes("deleted: true"),
    "tombstone must set deleted: true",
  );
  assert.ok(
    privacyUtils.includes("deletedAt: new Date().toISOString()"),
    "tombstone must stamp a string deletedAt accepted by isValidTombstone",
  );
  assert.ok(
    privacyUtils.includes("await setDoc(userRef, {"),
    "tombstone is recreated after deleteDoc as a create",
  );
});
