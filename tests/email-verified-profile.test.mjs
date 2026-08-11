import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(repoRoot, "src", "App.tsx"), "utf8");

test("getDefaultProfile no longer persists a stale emailVerified field", () => {
  const fnStart = source.indexOf("const getDefaultProfile");
  assert.notEqual(fnStart, -1, "getDefaultProfile not found");
  const fnBody = source.slice(fnStart, source.indexOf("});", fnStart) + 3);
  assert.doesNotMatch(fnBody, /emailVerified/, "profile must not store a stale emailVerified field");
});

test("signup setDoc does not write emailVerified: false", () => {
  const setStart = source.indexOf("await setDoc(doc(db, \"users\", newUser.uid)");
  assert.notEqual(setStart, -1, "signup setDoc not found");
  const setBody = source.slice(setStart, source.indexOf("});", setStart) + 3);
  assert.doesNotMatch(setBody, /emailVerified/, "signup profile must not write emailVerified");
});

test("verification state is still read from the Auth user, not the profile", () => {
  // The repo's source of truth is the Auth token; ensure those reads still exist.
  assert.match(source, /!currentUser\.emailVerified/);
  assert.match(source, /auth\.currentUser\.emailVerified/);
});

test("firestore rules keep isSignedIn() tied to the Auth token email_verified", () => {
  const rules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
});
