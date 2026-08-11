import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverTs = readFileSync(path.join(repoRoot, "server.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const processApi = readFileSync(
  path.join(repoRoot, "api", "process.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const analyzeApi = readFileSync(
  path.join(repoRoot, "api", "analyze.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("server.ts has no bare getFirestore() call sites", () => {
  const bareCalls = serverTs.match(/getFirestore\(\s*\)/g) || [];
  assert.deepEqual(
    bareCalls,
    [],
    "every Firestore call must pass firestoreDatabaseId so role lookups " +
      "and health checks read the same database that documents are written to",
  );
});

test("server.ts routes Firestore calls through firestoreDatabaseId", () => {
  const namedCalls = serverTs.match(/getFirestore\(firestoreDatabaseId\)/g) || [];
  assert.ok(
    namedCalls.length >= 4,
    "expected getFirestore(firestoreDatabaseId) in enrichUserContext, " +
      "/api/health, analyze, signed-URL and delete handlers",
  );
});

test("serverless handlers persist to the configured Firestore database", () => {
  assert.ok(
    processApi.includes("getFirestore(admin.app(), getFirestoreDatabaseId())"),
    "api/process.ts must resolve Firestore with getFirestoreDatabaseId()",
  );
  assert.ok(
    analyzeApi.includes("getFirestore(getFirestoreDatabaseId())"),
    "api/analyze.ts must resolve Firestore with getFirestoreDatabaseId()",
  );
});
