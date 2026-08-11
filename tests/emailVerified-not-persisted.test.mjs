import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appTsx = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

test("signup profile no longer persists emailVerified", () => {
  const signupBlock = appTsx.match(
    /await setDoc\(doc\(db, "users", newUser\.uid\), \{[\s\S]*?\n\s*\}\);/,
  );
  assert.ok(signupBlock, "signup setDoc block must exist");
  assert.doesNotMatch(
    signupBlock[0],
    /emailVerified/,
    "the signup profile must not persist an emailVerified field that can never " +
      "be corrected by the update rules",
  );
});

test("getDefaultProfile no longer persists emailVerified", () => {
  const profileBlock = appTsx.match(
    /const getDefaultProfile = \(currentUser: User\) => \(\{[\s\S]*?\n  \}\);/,
  );
  assert.ok(profileBlock, "getDefaultProfile must exist");
  assert.doesNotMatch(
    profileBlock[0],
    /emailVerified/,
    "the recreated profile must not persist emailVerified either",
  );
});

test("verification state is always read from the auth token", () => {
  assert.ok(
    appTsx.includes("if (!currentUser.emailVerified)"),
    "App must keep gating on auth.currentUser.emailVerified",
  );
  assert.ok(
    appTsx.includes("if (!userCredential.user.emailVerified)"),
    "signup verification screen must read the auth user, not the profile",
  );
});
