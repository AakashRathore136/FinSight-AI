import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storageUtils = readFileSync(
  path.join(repoRoot, "src/lib/storageUtils.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const fileUpload = readFileSync(
  path.join(repoRoot, "src/components/FileUpload.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const analysisDetail = readFileSync(
  path.join(repoRoot, "src/components/AnalysisDetail.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("sessionStorage is no longer a cache writer in storageUtils", () => {
  assert.doesNotMatch(
    storageUtils,
    /sessionStorage\.setItem\(`fin_local_doc_/,
    "saveLocalAnalysis must not write a divergent sessionStorage mirror",
  );
});

test("the dead reader fallback is removed", () => {
  assert.doesNotMatch(
    storageUtils,
    /sessionStorage\.getItem\(`fin_local_doc_/,
    "getLocalDocumentById must read only the localStorage map",
  );
  assert.doesNotMatch(
    storageUtils,
    /sessionStorage\.removeItem\(`fin_local_doc_/,
    "deleteLocalDocument must not need a sessionStorage cleanup path",
  );
});

test("FileUpload no longer defines a divergent session cache writer", () => {
  assert.doesNotMatch(
    fileUpload,
    /cacheLocalAnalysis/,
    "the dead cacheLocalAnalysis writer must be removed in favor of saveLocalAnalysis",
  );
  assert.doesNotMatch(
    fileUpload,
    /fin_local_doc_/,
    "FileUpload must not write the sessionStorage key directly",
  );
});

test("a single working read path remains via the localStorage map", () => {
  assert.ok(
    storageUtils.includes("export function getLocalDocumentById("),
    "getLocalDocumentById must remain exported as the single reader",
  );
  assert.ok(
    analysisDetail.includes("getLocalDocumentById(docId)"),
    "AnalysisDetail must keep consuming the single read path",
  );
});
