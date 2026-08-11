import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverTs = readFileSync(path.join(repoRoot, "server.ts"), "utf8");
const storageRules = readFileSync(path.join(repoRoot, "storage.rules"), "utf8");

// Every storage path the backend generates has the shape
// `<namespace>/${ownerId or userId}/...` (see server.ts storage uploads).
// Firestore collection paths use `${documentId}`, so they are not matched.
const STORAGE_PATH_TEMPLATE = /[`'"]([a-z][a-z0-9_]*)\/\$\{(ownerId|userId)\}\//g;

function serverStorageNamespaces(source) {
  const namespaces = new Set();
  for (const match of source.matchAll(STORAGE_PATH_TEMPLATE)) {
    namespaces.add(match[1]);
  }
  return [...namespaces];
}

// Extract the body of a storage rule block (`match /<ns>/... { ... }`), which
// is terminated by a 4-space-indented closing brace.
function getRuleBlock(rules, ns) {
  const start = rules.indexOf(`match /${ns}/`);
  if (start === -1) return null;
  const end = rules.indexOf("\n    }", start);
  return end === -1 ? rules.slice(start) : rules.slice(start, end);
}

test("server-generated storage namespaces are covered by storage.rules", () => {
  const namespaces = serverStorageNamespaces(serverTs);
  assert.ok(
    namespaces.length > 0,
    "expected to find storage path templates like `analyses/${ownerId}/...` in server.ts",
  );

  for (const ns of namespaces) {
    const block = getRuleBlock(storageRules, ns);
    assert.ok(block, `storage.rules has no rule covering /${ns}/ namespace`);
    assert.ok(
      /allow read:/.test(block),
      `/${ns}/ rule does not grant a controlled read access`,
    );
  }
});

test("sanitizeStorageFilename prevents double URL-encoded path traversal attacks", () => {
  function sanitize(filename) {
    let name = String(filename || "document.pdf");
    for (let i = 0; i < 5; i++) {
      try {
        const decoded = decodeURIComponent(name);
        if (decoded === name) break;
        name = decoded;
      } catch { break; }
    }
    name = name.replace(/\\/g, "/").split("/").pop() || "document.pdf";
    name = name
      .replace(/\.\./g, "_")
      .replace(/%2e/gi, "_")
      .replace(/%2f/gi, "_")
      .replace(/[\/\\]/g, "_")
      .replace(/[\x00-\x1f\x7f]/g, "_")
      .trim();
    if (!name || name === "." || name === "..") name = "document.pdf";
    return name;
  }

  const malicious = "%252e%252e%252fother_user%252fsecret.pdf";
  const sanitized = sanitize(malicious);
  assert.ok(!sanitized.includes(".."));
  assert.ok(!sanitized.includes("/"));
  assert.ok(!sanitized.includes("%2f"));
});
