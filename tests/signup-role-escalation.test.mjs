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
const roleConstants = readFileSync(
  path.join(repoRoot, "src/lib/roleConstants.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const privacyUtils = readFileSync(
  path.join(repoRoot, "src/lib/privacyUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const firestoreRules = readFileSync(
  path.join(repoRoot, "firestore.rules"),
  "utf8",
).replace(/\r\n/g, "\n");

test("DEFAULT_ROLE is junior_analyst", () => {
  assert.match(
    roleConstants,
    /export const DEFAULT_ROLE = "junior_analyst" as const/,
  );
});

test("signup never writes a user-controlled role", () => {
  assert.doesNotMatch(
    appTsx,
    /signupRole/,
    "signupRole state must not exist — users must not pick their role",
  );
  assert.doesNotMatch(
    appTsx,
    /setSignupRole/,
    "no signup role setter may exist in the client",
  );
  assert.ok(
    appTsx.includes("role: DEFAULT_ROLE"),
    "email signup and default profile creation must assign DEFAULT_ROLE",
  );
  assert.ok(
    !/<select[\s\S]*junior_analyst[\s\S]*senior_pm/.test(appTsx),
    "signup UI must not expose a privileged-role selector",
  );
});

test("account-deletion tombstone does not preserve privileged roles", () => {
  assert.ok(
    privacyUtils.includes("role: DEFAULT_ROLE"),
    "deleteUserData tombstone must write DEFAULT_ROLE so create rules pass",
  );
  assert.doesNotMatch(
    privacyUtils,
    /profile\.role && profile\.role !== "admin"/,
    "tombstone must not re-apply a previously privileged role",
  );
});

test("Firestore rules force junior_analyst on user create and lock role on update", () => {
  assert.match(
    firestoreRules,
    /allow create:\s*if isAuthenticatedOwner\(userId\) && isValidUser\(incoming\(\)\) && incoming\(\)\.role == 'junior_analyst'/,
    "create must require junior_analyst (blocks cro/senior_pm/compliance/admin)",
  );
  assert.ok(
    firestoreRules.includes(
      "incoming().diff(existing()).affectedKeys().hasOnly(['displayName', 'photoURL'])",
    ),
    "non-admin updates must not be able to change role",
  );
});

test("sanitizeRole strips privileged roles when allowPrivileged is false", () => {
  assert.ok(
    roleConstants.includes("PRIVILEGED_ROLES"),
    "privileged roles must be enumerated for sanitisation",
  );
  assert.ok(
    roleConstants.includes("export function sanitizeRole"),
    "sanitizeRole helper must exist for defensive client reads",
  );
  assert.ok(
    /if \(\s*!allowPrivileged &&[\s\S]*PRIVILEGED_ROLES/.test(roleConstants),
    "sanitizeRole must refuse privileged values when allowPrivileged is false",
  );
});
