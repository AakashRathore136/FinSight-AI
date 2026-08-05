import { test } from "node:test";
import assert from "node:assert/strict";

const { calculateCategoryBaseline, detectLargeTransactions } = await import(
  "../src/lib/anomalyStats.ts"
);

function tx(id, amount, category) {
  return {
    id,
    userId: "u1",
    amount,
    category,
    date: new Date("2026-07-15"),
  };
}

test("calculateCategoryBaseline aggregates mean, stdDev and monthly totals", () => {
  const baseline = calculateCategoryBaseline([
    tx("a", 100, "Food"),
    tx("b", 100, "Food"),
    tx("c", 10000, "Food"),
  ]);
  const food = baseline.get("Food");
  assert.ok(food, "baseline should contain the Food category");
  assert.equal(food.mean, 3400);
  assert.equal(food.monthlyTotals.length, 1);
  assert.equal(food.monthlyTotals[0], 10200);
});

test("detectLargeTransactions flags a dominant amount via leave-one-out baseline", () => {
  const transactions = [
    tx("a", 100, "Food"),
    tx("b", 100, "Food"),
    tx("c", 100, "Food"),
    tx("d", 10000, "Food"),
  ];
  const baseline = calculateCategoryBaseline(transactions);
  const detected = detectLargeTransactions(transactions, baseline).map(
    (t) => t.id,
  );
  assert.deepEqual(detected, ["d"]);
});

test("detectLargeTransactions does not flag categories below the minimum sample size", () => {
  const transactions = [
    tx("a", 100, "Food"),
    tx("b", 100, "Food"),
    tx("c", 10000, "Food"),
  ];
  const baseline = calculateCategoryBaseline(transactions);
  const detected = detectLargeTransactions(transactions, baseline);
  assert.equal(detected.length, 0);
});
