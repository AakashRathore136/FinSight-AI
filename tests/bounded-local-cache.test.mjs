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

test("local cache is bounded by a max document count", () => {
  assert.ok(
    /const MAX_LOCAL_DOCS = \d+/.test(storageUtils),
    "saveLocalAnalysis must define a MAX_LOCAL_DOCS cap",
  );
  assert.ok(
    storageUtils.includes("evictOldest(docMap, MAX_LOCAL_DOCS)"),
    "the localStorage mirror must evict oldest entries down to the cap",
  );
});

test("saveLocalAnalysis evicts oldest storedAt entries first", () => {
  assert.ok(
    storageUtils.includes("epochOf(map[a]) - epochOf(map[b])"),
    "eviction must sort by storedAt so the oldest entries are removed first",
  );
  assert.ok(
    storageUtils.includes("function evictOldest("),
    "an eviction helper must exist",
  );
});

test("saveLocalAnalysis consults navigator.storage.estimate() before writing", () => {
  assert.ok(
    storageUtils.includes("navigator.storage?.estimate"),
    "quota pressure must be checked via navigator.storage.estimate()",
  );
  assert.ok(
    storageUtils.includes("QUOTA_PRESSURE_RATIO"),
    "a pressure threshold must gate proactive eviction",
  );
});

test("quota failures are surfaced instead of only console.warn", () => {
  assert.ok(
    storageUtils.includes("LocalSaveResult"),
    "saveLocalAnalysis must return a result that signals quota failure",
  );
  assert.ok(
    storageUtils.includes("QuotaExceededError"),
    "QuotaExceededError must be detected",
  );
  assert.ok(
    storageUtils.includes("return { ok: false, quotaExceeded: true }"),
    "an unrecoverable quota error must be surfaced to the caller",
  );
});

test("FileUpload surfaces quota pressure to the UI", () => {
  assert.ok(
    fileUpload.includes("await saveLocalAnalysis(result)"),
    "the upload flow must await the cache write result",
  );
  assert.match(
    fileUpload,
    /toast\.warning\([\s\S]{0,200}storage quota reached/i,
    "a quota failure must surface a user-visible toast",
  );
});
