import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverTs = readFileSync(path.join(repoRoot, "server.ts"), "utf8");

test("the uploaded PDF is deleted on both Firestore write failure paths", () => {
  const cleanupBlock = serverTs.slice(serverTs.indexOf("cleanupUploadedPdf"));
  const permissionDeniedBranch = serverTs.slice(
    serverTs.indexOf("if (isPermissionDenied) {"),
    serverTs.indexOf("return res.status(200).json({"),
  );

  assert.ok(
    /const cleanupUploadedPdf = async \(\) => {/.test(serverTs),
    "a shared cleanup helper must exist for deleting the just-uploaded object",
  );
  assert.ok(
    cleanupBlock.includes("await bucket.file(storagePath).delete();"),
    "the cleanup helper must delete the uploaded object",
  );
  assert.ok(
    /if \(isPermissionDenied\) {\s*\n\s*await cleanupUploadedPdf\(\);/.test(
      permissionDeniedBranch,
    ),
    "the permission-denied fallback must delete the uploaded object",
  );
  assert.ok(
    /} else {\s*\n\s*await cleanupUploadedPdf\(\);/.test(permissionDeniedBranch),
    "the non-permission-denied failure path must still delete the uploaded object",
  );
});
