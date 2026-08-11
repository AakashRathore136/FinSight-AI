import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "src", "components", "AnalysisList.tsx"),
  "utf8",
);

const fnStart = source.indexOf("const handleDelete");
assert.notEqual(fnStart, -1, "handleDelete not found");
// Capture through the function's closing brace: the `};\n` that precedes the
// next member (handleDownload) which is the next top-level member after it.
const nextMember = source.indexOf("const handleDownload", fnStart);
assert.notEqual(nextMember, -1, "handleDownload (next member) not found");
const fnBody = source.slice(fnStart, nextMember);

test("handleDelete removes the document from local state on success", () => {
  // The success path (after res.ok) must optimistically drop the deleted id
  // from the documents list so it doesn't linger/reappear before the snapshot
  // re-emit. Previously only the failure path touched local state.
  assert.match(fnBody, /setDocuments\(\(prev\) => prev\.filter\(\(doc\) => doc\.id !== id\)\)/);
});

test("handleDelete keeps the success path after the filter (toast still fires)", () => {
  const filterIdx = fnBody.indexOf("prev.filter");
  const toastIdx = fnBody.indexOf('toast.success("Document removed")');
  assert.notEqual(filterIdx, -1);
  assert.notEqual(toastIdx, -1);
  assert.ok(filterIdx < toastIdx, "setDocuments filter must run before the success toast");
});

test("handleDelete still reports failure via toast.error in the catch path", () => {
  assert.match(fnBody, /toast\.error\("Failed to delete document"\)/);
});
