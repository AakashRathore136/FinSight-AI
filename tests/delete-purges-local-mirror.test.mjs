import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analysisList = readFileSync(
  path.join(repoRoot, "src/components/AnalysisList.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("successful delete also purges the local mirror", () => {
  const successBlock = analysisList.match(
    /if \(!res\.ok\) \{[\s\S]*?toast\.success\("Document removed"\);/,
  );
  assert.ok(successBlock, "the server-delete success path must exist");
  assert.ok(
    successBlock[0].includes("deleteLocalDocument(id);"),
    "deleteLocalDocument(id) must run on the success path so the record does " +
      "not reappear from localStorage on the next snapshot",
  );
});

test("deleteLocalDocument runs on both server-backed paths", () => {
  assert.ok(
    (analysisList.match(/deleteLocalDocument\(id\);/g) || []).length >= 2,
    "deleteLocalDocument must be called on both the success and failure paths",
  );
});
