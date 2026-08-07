import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addWeeks,
  addMonths,
  addYears,
  isBefore,
  startOfDay,
  differenceInCalendarDays,
} from "date-fns";

function isRecurringFrequency(frequency) {
  return frequency === "weekly" || frequency === "monthly" || frequency === "yearly";
}

function advanceByFrequency(date, frequency) {
  if (frequency === "weekly") return addWeeks(date, 1);
  if (frequency === "monthly") return addMonths(date, 1);
  if (frequency === "yearly") return addYears(date, 1);
  return date;
}

function advanceDueDateAfterPayment(dueDate, frequency, paidDate = new Date()) {
  if (!isRecurringFrequency(frequency)) return null;
  const base = new Date(dueDate);
  if (Number.isNaN(base.getTime())) return null;
  const reference = startOfDay(paidDate);
  let next = startOfDay(base);
  do {
    next = advanceByFrequency(next, frequency);
  } while (next.getTime() <= reference.getTime());
  return next.toISOString();
}

function applyBillPayment(bill, paidDate = new Date()) {
  const recurring = isRecurringFrequency(bill.frequency);
  const currentDue = bill.nextDueDate || bill.dueDate;
  if (!recurring) {
    return {
      isPaid: true,
      lastPaidDate: paidDate.toISOString(),
      nextDueDate: bill.nextDueDate ?? bill.dueDate,
      dueDate: bill.dueDate,
    };
  }
  const nextDueDate = advanceDueDateAfterPayment(currentDue, bill.frequency, paidDate) || currentDue;
  return {
    isPaid: false,
    lastPaidDate: paidDate.toISOString(),
    nextDueDate,
    dueDate: nextDueDate,
  };
}

function isOverdue(bill, reference = new Date()) {
  if (bill.isPaid) return false;
  const due = new Date(bill.nextDueDate || bill.dueDate);
  return isBefore(startOfDay(due), startOfDay(reference));
}

function isUpcoming(bill, reference = new Date()) {
  if (bill.isPaid || isOverdue(bill, reference)) return false;
  const due = new Date(bill.nextDueDate || bill.dueDate);
  const days = differenceInCalendarDays(startOfDay(due), startOfDay(reference));
  return days >= 0 && days <= 7;
}

function baseBill(overrides) {
  return {
    id: "1",
    userId: "u1",
    name: "Netflix",
    amount: 15,
    dueDate: "2026-08-06T00:00:00.000Z",
    frequency: "monthly",
    category: "Subscription",
    isPaid: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    nextDueDate: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

test("monthly recurring payment stays active and advances past pay day", () => {
  const paidAt = new Date("2026-08-06T12:00:00.000Z");
  const result = applyBillPayment(baseBill({ frequency: "monthly" }), paidAt);
  assert.equal(result.isPaid, false);
  assert.ok(new Date(result.nextDueDate).getTime() > startOfDay(paidAt).getTime());
  assert.equal(result.dueDate, result.nextDueDate);
});

test("weekly and yearly recurring payments stay active", () => {
  const paidAt = new Date("2026-08-06T12:00:00.000Z");
  const weekly = applyBillPayment(baseBill({ frequency: "weekly" }), paidAt);
  const yearly = applyBillPayment(baseBill({ frequency: "yearly" }), paidAt);
  assert.equal(weekly.isPaid, false);
  assert.equal(yearly.isPaid, false);
  assert.ok(new Date(weekly.nextDueDate) > startOfDay(paidAt));
  assert.ok(new Date(yearly.nextDueDate) > startOfDay(paidAt));
});

test("one-time custom bill remains completed after payment", () => {
  const paidAt = new Date("2026-08-06T12:00:00.000Z");
  const result = applyBillPayment(baseBill({ frequency: "custom" }), paidAt);
  assert.equal(result.isPaid, true);
  assert.equal(result.dueDate, "2026-08-06T00:00:00.000Z");
});

test("paid recurring bill still appears in obligation and upcoming helpers", () => {
  const paidAt = new Date("2026-08-06T12:00:00.000Z");
  const payment = applyBillPayment(baseBill({ frequency: "monthly" }), paidAt);
  const bill = { ...baseBill({ frequency: "monthly" }), ...payment };
  assert.equal(bill.isPaid, false);
  assert.equal(isOverdue(bill, paidAt), false);
  const days = differenceInCalendarDays(startOfDay(new Date(bill.nextDueDate)), startOfDay(paidAt));
  assert.ok(days > 0);
  assert.equal(isUpcoming(bill, paidAt), days <= 7);
});
