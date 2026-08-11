import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { format, subMonths } from "date-fns";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const anomalyUtilsPath = path.join(repoRoot, "src/lib/anomalyUtils.ts");
const rawSource = readFileSync(anomalyUtilsPath, "utf8");

// Transform TS source using esbuild and stub external dependencies for Node test environment
const transformed = esbuild.transformSync(rawSource, { loader: "ts" }).code
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']firebase\/firestore["'];?/,
    "const collection = () => {}, query = () => {}, where = () => {}, orderBy = () => {}, getDocs = async () => ({ docs: [] }), doc = () => {}, setDoc = async () => {}, serverTimestamp = () => {};",
  )
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\/firebase["'];?/,
    "const db = {}, handleFirestoreError = () => {}, OperationType = {};",
  )
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\/utils["'];?/,
    'function formatCurrency(n) { return "$" + Number(n).toLocaleString(); } function toDate(d) { return d instanceof Date ? d : new Date(d); }',
  )
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']date-fns["'];?/,
    'function format(d, f) { if (f === "yyyy-MM") { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"); return y + "-" + m; } return ""; } function subMonths(d, n) { const res = new Date(d); res.setMonth(res.getMonth() - n); return res; } function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }',
  )
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\/anomalyStats["'];?/,
    "const calculateCategoryBaseline = () => new Map(), detectLargeTransactions = () => [];",
  );

const dataUrl = "data:text/javascript;base64," + Buffer.from(transformed).toString("base64");
const { detectAnomalies } = await import(dataUrl);

function createTx(id, amount, category, date = new Date()) {
  return {
    id,
    userId: "user-1",
    amount,
    category,
    date,
  };
}

test("source code specifies percentage increase over baseline formula ((amount - mean) / mean)", () => {
  assert.ok(
    /Math\.round\(\(\(amount\s*-\s*mean\)\s*\/\s*mean\)\s*\*\s*100\)/.test(rawSource) ||
    /Math\.round\(\(amount\s*\/\s*mean\s*-\s*1\)\s*\*\s*100\)/.test(rawSource),
    "large_transaction must compute percentage increase over mean baseline",
  );
  assert.ok(
    /Math\.round\(\(\(amount\s*-\s*lastAmount\)\s*\/\s*lastAmount\)\s*\*\s*100\)/.test(rawSource) ||
    /Math\.round\(\(amount\s*\/\s*lastAmount\s*-\s*1\)\s*\*\s*100\)/.test(rawSource),
    "category_spike must compute percentage increase over lastAmount baseline",
  );
});

test("large_transaction description computes percentage increase over baseline (248% for 4000 vs 1150 mean)", () => {
  // Baseline mean calculation:
  // tx1: 200, tx2: 200, tx3: 200, tx4: 4000
  // total = 4600, count = 4, mean = 1150
  // amount = 4000
  // (4000 - 1150) / 1150 * 100 = 247.8% -> 248% above average (Not 348%)
  const transactions = [
    createTx("1", 200, "Travel"),
    createTx("2", 200, "Travel"),
    createTx("3", 200, "Travel"),
    createTx("4", 4000, "Travel"),
  ];

  const anomalies = detectAnomalies(transactions);
  const largeTx = anomalies.find((a) => a.type === "large_transaction");
  assert.ok(largeTx, "Should detect a large_transaction anomaly");

  assert.match(
    largeTx.description,
    /248% above average/,
    "Description should report 248% above average increase over baseline, not ratio of baseline",
  );
  assert.doesNotMatch(
    largeTx.description,
    /348% above average/,
    "Description should not report 348% (ratio of baseline)",
  );
});

test("category_spike description computes percentage increase over baseline (200% increase for 15000 vs 5000)", () => {
  const now = new Date();
  const lastMonthDate = subMonths(now, 1);

  const transactions = [
    // Last month spending: $5,000
    createTx("last-1", 5000, "Dining", lastMonthDate),
    // This month spending: $15,000
    createTx("this-1", 15000, "Dining", now),
  ];

  const anomalies = detectAnomalies(transactions);
  const spike = anomalies.find((a) => a.type === "category_spike");
  assert.ok(spike, "Should detect a category_spike anomaly");

  assert.match(
    spike.description,
    /200% increase/,
    "Description should report 200% increase over baseline for $15,000 vs $5,000",
  );
  assert.doesNotMatch(
    spike.description,
    /300% increase/,
    "Description should not report 300% increase (ratio of baseline)",
  );
});

test("category_spike description calculates smaller increase correctly (e.g. 100% increase for 12000 vs 6000)", () => {
  const now = new Date();
  const lastMonthDate = subMonths(now, 1);

  const transactions = [
    // Last month spending: $6,000
    createTx("last-1", 6000, "Shopping", lastMonthDate),
    // This month spending: $12,000 (diff = 6000 > 5000 threshold, amount = 12000 > 6000 * 1.5)
    createTx("this-1", 12000, "Shopping", now),
  ];

  const anomalies = detectAnomalies(transactions);
  const spike = anomalies.find((a) => a.type === "category_spike");
  assert.ok(spike, "Should detect a category_spike anomaly");

  assert.match(
    spike.description,
    /100% increase/,
    "Description should report 100% increase over baseline for $12,000 vs $6,000",
  );
});
