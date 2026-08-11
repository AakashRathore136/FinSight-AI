import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = readFileSync(
  path.join(repoRoot, "src", "components", "anomaly", "AnomalyDashboard.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("large_transaction anomalies stamp createdAt at detection time", () => {
  assert.ok(
    dashboard.includes("createdAt: new Date().toISOString(),"),
    "createdAt must be the detection timestamp, not the transaction date",
  );
  assert.ok(
    dashboard.includes("date: tx.date,"),
    "the transaction date must still be stored in the date field",
  );
});

test("category_spike anomalies stamp createdAt at detection time", () => {
  assert.match(
    dashboard,
    /createdAt: new Date\(\)\.toISOString\(\),/g,
    "both branches must use new Date().toISOString() for createdAt",
  );
  assert.ok(
    dashboard.includes(
      "date: (spike.transactions[spike.transactions.length - 1]?.date as Date) || new Date(),",
    ),
    "the last triggering transaction date must still be stored in the date field",
  );
});

test("anomaly list still orders by createdAt for detection-time ordering", () => {
  assert.ok(
    dashboard.includes('orderBy("createdAt", "desc")'),
    "the anomalies list must order by createdAt so latest detections sort first",
  );
});
