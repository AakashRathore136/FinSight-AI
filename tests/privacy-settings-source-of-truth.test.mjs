import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privacyUtils = readFileSync(
  path.join(repoRoot, "src/lib/privacyUtils.ts"),
  "utf8",
);
const privacyDashboard = readFileSync(
  path.join(repoRoot, "src/components/privacy/PrivacyDashboard.tsx"),
  "utf8",
);

test("PrivacyDashboard loads from Firestore with a localStorage fallback", () => {
  assert.ok(
    privacyDashboard.includes("const remote = await getPrivacySettings(user.uid);"),
    "loadPrivacyData must read privacy settings from Firestore",
  );
  assert.ok(
    /setPrivacySettings\(\{ \.\.\.DEFAULT_PRIVACY_SETTINGS, \.\.\.remote \}\)/.test(
      privacyDashboard,
    ),
    "the Firestore snapshot must be merged over DEFAULT_PRIVACY_SETTINGS",
  );
  assert.ok(
    /setPrivacySettings\(\{ \.\.\.DEFAULT_PRIVACY_SETTINGS, \.\.\.cachedSettings \}\)/.test(
      privacyDashboard,
    ),
    "the localStorage cache must be used as the offline fallback",
  );
});

test("getPrivacySettings throws so callers can use their offline cache", () => {
  assert.ok(
    privacyUtils.includes("throw err;"),
    "getPrivacySettings must re-throw on a read failure instead of returning defaults",
  );
  assert.ok(
    privacyUtils.includes("return { ...DEFAULT_PRIVACY_SETTINGS, ...snap.data() };"),
    "getPrivacySettings must merge the stored document over the defaults",
  );
});
