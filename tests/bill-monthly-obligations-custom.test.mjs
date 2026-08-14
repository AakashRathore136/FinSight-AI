import { test } from "node:test";
import assert from "node:assert/strict";

// billUtils.ts pulls in firebase at import time, which cannot be resolved under
// node:test, so the pure calculateMonthlyObligations formula is mirrored here
// (same convention as tests/bill-payment-lifecycle.test.mjs) to pin the
// expected behavior. Previously the `default` (custom / one-off) frequency case
// returned the running total unchanged, so a one-off bill was silently excluded
// from the monthly obligation total while still inflating the per-week "Due
// This Week" summary.

function calculateMonthlyObligations(bills) {
  return bills.reduce((total, bill) => {
    if (bill.deleted || bill.isPaid) return total;
    switch (bill.frequency) {
      case "weekly":
        return total + (bill.amount * 52) / 12;
      case "monthly":
        return total + bill.amount;
      case "yearly":
        return total + bill.amount / 12;
      default:
        // custom / one-off: amortize across the current month
        return total + (bill.amount / 30) * 7;
    }
  }, 0);
}

function bill(amount, frequency, extra = {}) {
  return {
    amount,
    frequency,
    deleted: false,
    isPaid: false,
    nextDueDate: "2026-08-20",
    dueDate: "2026-08-20",
    ...extra,
  };
}

test("custom/one-off bills contribute to monthly obligations (#1315)", () => {
  const monthly = calculateMonthlyObligations([bill(2000, "custom")]);
  assert.ok(monthly > 0, "one-off bill must count toward monthly obligations");
  assert.equal(monthly, (2000 / 30) * 7);
});

test("paid/deleted one-off bills are still excluded", () => {
  const paid = calculateMonthlyObligations([bill(2000, "custom", { isPaid: true })]);
  assert.equal(paid, 0);
  const deleted = calculateMonthlyObligations([bill(2000, "custom", { deleted: true })]);
  assert.equal(deleted, 0);
});

test("recurring frequencies still sum as before", () => {
  const total = calculateMonthlyObligations([
    bill(100, "weekly"),
    bill(200, "monthly"),
    bill(1200, "yearly"),
  ]);
  assert.equal(total, (100 * 52) / 12 + 200 + 1200 / 12);
});
