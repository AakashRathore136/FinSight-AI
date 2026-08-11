import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const firebaseJson = JSON.parse(readFileSync(path.join(repoRoot, "firebase.json"), "utf8"));
const indexesJson = JSON.parse(
  readFileSync(path.join(repoRoot, "firestore.indexes.json"), "utf8"),
);

function hasIndex(collectionGroup, fieldPaths) {
  return indexesJson.indexes.some((index) => {
    if (index.collectionGroup !== collectionGroup) return false;
    const declared = index.fields.map((field) => field.fieldPath);
    return (
      declared.length === fieldPaths.length &&
      fieldPaths.every((fp) => declared.includes(fp))
    );
  });
}

const required = [
  ["transactions", ["userId", "date"]],
  ["transactions", ["ownerId", "date"]],
  ["health_scores", ["userId", "month", "createdAt"]],
  ["portfolioHoldings", ["userId", "symbol"]],
  ["portfolioHoldings", ["userId", "createdAt"]],
  ["portfolioTransactions", ["userId", "date"]],
  ["portfolios", ["userId", "updatedAt"]],
  ["portfolioSnapshots", ["userId", "portfolioId", "snapshotDate"]],
  ["forecasts", ["userId", "month"]],
  ["activity_log", ["userId", "timestamp"]],
  ["documents", ["ownerId", "createdAt"]],
  ["documents", ["ownerId", "status", "createdAt"]],
  ["analyses", ["ownerId", "processedAt"]],
  ["chat_conversations", ["userId", "lastMessageAt"]],
  ["chat_messages", ["conversationId", "userId", "timestamp"]],
  ["anomalies", ["userId", "dedupKey"]],
  ["anomalies", ["userId", "date"]],
  ["anomalies", ["userId", "dismissed", "date"]],
  ["anomalies", ["userId", "dismissed", "createdAt"]],
  ["budget_categories", ["userId", "name"]],
  ["budget_rollovers", ["userId", "createdAt"]],
  ["bills", ["userId", "dueDate"]],
  ["emergency_funds", ["userId", "createdAt"]],
  ["challenges", ["userId", "createdAt"]],
  ["tax_estimates", ["userId", "createdAt"]],
];

test("firebase.json wires the Firestore indexes file", () => {
  assert.equal(
    firebaseJson.firestore.indexes,
    "firestore.indexes.json",
    "firebase.json must reference firestore.indexes.json so deploys ship " +
      "the composite indexes the app queries",
  );
});

test("firestore.indexes.json declares every composite index the app queries", () => {
  const missing = required.filter(([group, fields]) => !hasIndex(group, fields));
  assert.deepEqual(
    missing,
    [],
    "composite indexes missing for queries that combine where() + orderBy() " +
      "would fail at runtime with a failed-precondition error",
  );
});

test("every declared index is a valid composite index", () => {
  for (const index of indexesJson.indexes) {
    assert.equal(typeof index.collectionGroup, "string");
    assert.ok(Array.isArray(index.fields));
    assert.ok(index.fields.length >= 2, "single-field indexes need no declaration");
    for (const field of index.fields) {
      assert.ok(field.fieldPath.length > 0);
      assert.ok(
        ["ASCENDING", "DESCENDING"].includes(field.order),
        `field ${field.fieldPath} must have ASCENDING/DESCENDING order`,
      );
    }
  }
});
