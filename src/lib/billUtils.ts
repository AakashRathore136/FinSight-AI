/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  orderBy,
} from 'firebase/firestore';
import {
  addWeeks,
  addMonths,
  addYears,
  isBefore,
  startOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { db, handleFirestoreError, OperationType } from './firebase';
import { toDate } from './utils';

export type BillFrequency = 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Bill {
  id: string;
  userId: string;
  name: string;
  amount: number;
  dueDate: string;
  frequency: BillFrequency;
  category: string;
  isPaid: boolean;
  lastPaidDate?: string | null;
  createdAt: string;
  nextDueDate?: string | null;
  deleted?: boolean;
}

export interface BillInput {
  name: string;
  amount: number;
  dueDate: string;
  frequency: BillFrequency;
  category: string;
}

const UPCOMING_WINDOW_DAYS = 7;

export function isRecurringFrequency(frequency: BillFrequency): boolean {
  return frequency === 'weekly' || frequency === 'monthly' || frequency === 'yearly';
}

export function parseUTCDate(dateStr: string): Date {
  const dateOnly = String(dateStr || "").split("T")[0];
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const fallback = new Date(dateStr);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  const [year, month, day] = dateOnly.split("-").map(Number);
  // Set to 12:00 UTC to completely eliminate local timezone & DST boundary shifts
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function advanceByFrequency(
  date: Date,
  frequency: BillFrequency,
  originalDueDay?: number
): Date {
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = originalDueDay ?? date.getUTCDate();

  if (frequency === 'weekly') {
    return new Date(Date.UTC(utcYear, utcMonth, utcDay + 7, 12, 0, 0));
  }
  if (frequency === 'monthly') {
    const nextMonthIndex = utcMonth + 1;
    // Calculate last day of next month (UTC)
    const lastDayOfNextMonth = new Date(Date.UTC(utcYear, nextMonthIndex + 1, 0, 12, 0, 0)).getUTCDate();
    const safeDay = Math.min(utcDay, lastDayOfNextMonth);
    return new Date(Date.UTC(utcYear, nextMonthIndex, safeDay, 12, 0, 0));
  }
  if (frequency === 'yearly') {
    const nextYear = utcYear + 1;
    const lastDayOfNextYearMonth = new Date(Date.UTC(nextYear, utcMonth + 1, 0, 12, 0, 0)).getUTCDate();
    const safeDay = Math.min(utcDay, lastDayOfNextYearMonth);
    return new Date(Date.UTC(nextYear, utcMonth, safeDay, 12, 0, 0));
  }
  return date;
}

export async function fetchUserBills(userId: string): Promise<Bill[]> {
  try {
    const billsRef = collection(db, 'bills');
    const q = query(
      billsRef,
      where('userId', '==', userId),
      orderBy('dueDate', 'asc')
    );
    const snapshot = await getDocs(q);
    const bills: Bill[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.deleted === true) return;
      bills.push({
        id: docSnap.id,
        userId: data.userId || '',
        name: data.name || '',
        amount: data.amount || 0,
        dueDate: data.dueDate || '',
        frequency: data.frequency || 'monthly',
        category: data.category || 'General',
        isPaid: data.isPaid || false,
        lastPaidDate: data.lastPaidDate || null,
        createdAt: data.createdAt || '',
        nextDueDate: data.nextDueDate || null,
        deleted: data.deleted === true,
      });
    });
    return bills;
  } catch (error) {
    console.error('Error fetching bills:', error);
    handleFirestoreError(error, OperationType.LIST, 'bills');
    return [];
  }
}

export async function createBill(userId: string, input: BillInput): Promise<Bill | null> {
  try {
    const id = doc(collection(db, 'bills')).id;
    const nextDueDate = calculateNextDueDate(input.dueDate, input.frequency, undefined);
    const newBill: Omit<Bill, 'id'> = {
      userId,
      name: input.name.trim(),
      amount: input.amount,
      dueDate: input.dueDate,
      frequency: input.frequency,
      category: input.category.trim() || 'General',
      isPaid: false,
      lastPaidDate: null,
      createdAt: new Date().toISOString(),
      nextDueDate,
    };
    await setDoc(doc(db, 'bills', id), {
      ...newBill,
      createdAt: serverTimestamp(),
    });
    return { ...newBill, id };
  } catch (error) {
    console.error('Error creating bill:', error);
    handleFirestoreError(error, OperationType.CREATE, 'bills');
    return null;
  }
}

export async function softDeleteBill(billId: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'bills', billId), { deleted: true });
    return true;
  } catch (error) {
    console.error('Error soft-deleting bill:', error);
    handleFirestoreError(error, OperationType.DELETE, `bills/${billId}`);
    return false;
  }
}

/**
 * @deprecated Use softDeleteBill instead. This function performs a soft delete, not an actual deletion.
 */
export async function deleteBill(billId: string): Promise<boolean> {
  return softDeleteBill(billId);
}

export function calculateNextDueDate(
  dueDate: string,
  frequency: BillFrequency,
  fromDate?: Date | null
): string | null {
  const base = toDate(dueDate);
  if (!base) return null;
  if (!isRecurringFrequency(frequency)) {
    return startOfDay(base).toISOString();
  }

  const reference = fromDate ? startOfDay(fromDate) : startOfDay(new Date());
  let next = startOfDay(base);

  while (isBefore(next, reference)) {
    next = advanceByFrequency(next, frequency);
  }

  return next.toISOString();
}

/** Next cycle after a payment — always moves at least one period for recurring bills. */
export function advanceDueDateAfterPayment(
  dueDate: string,
  frequency: BillFrequency,
  paidDate: Date = new Date()
): string | null {
  if (!isRecurringFrequency(frequency)) return null;

  const base = toDate(dueDate);
  if (!base) return null;

  const reference = startOfDay(paidDate);
  const originalDay = base.getDate();
  let next = startOfDay(base);

  do {
    next = advanceByFrequency(next, frequency, originalDay);
  } while (next.getTime() <= reference.getTime());

  return next.toISOString();
}

export function applyBillPayment(
  bill: Bill,
  paidDate: Date = new Date()
): Pick<Bill, 'isPaid' | 'lastPaidDate' | 'nextDueDate' | 'dueDate'> {
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

export function isOverdue(bill: Bill, reference: Date = new Date()): boolean {
  if (bill.deleted || bill.isPaid) return false;
  const due = toDate(bill.nextDueDate || bill.dueDate);
  if (!due) return false;
  return isBefore(startOfDay(due), startOfDay(reference));
}

export function isUpcoming(bill: Bill, reference: Date = new Date()): boolean {
  if (bill.deleted || bill.isPaid || isOverdue(bill, reference)) return false;
  const due = toDate(bill.nextDueDate || bill.dueDate);
  if (!due) return false;
  const days = differenceInCalendarDays(startOfDay(due), startOfDay(reference));
  return days >= 0 && days <= UPCOMING_WINDOW_DAYS;
}

export function getUpcomingBills(bills: Bill[], reference: Date = new Date()): Bill[] {
  return bills
    .filter((b) => isUpcoming(b, reference))
    .sort((a, b) => {
      const da = toDate(a.nextDueDate || a.dueDate);
      const db = toDate(b.nextDueDate || b.dueDate);
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });
}

export function getOverdueBills(bills: Bill[], reference: Date = new Date()): Bill[] {
  return bills
    .filter((b) => isOverdue(b, reference))
    .sort((a, b) => {
      const da = toDate(a.nextDueDate || a.dueDate);
      const db = toDate(b.nextDueDate || b.dueDate);
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });
}

export function getDaysUntilDue(bill: Bill, reference: Date = new Date()): number {
  const due = toDate(bill.nextDueDate || bill.dueDate);
  if (!due) return Number.POSITIVE_INFINITY;
  return differenceInCalendarDays(startOfDay(due), startOfDay(reference));
}

export function calculateMonthlyObligations(bills: Bill[]): number {
  return bills.reduce((total, bill) => {
    if (bill.deleted || bill.isPaid) return total;
    switch (bill.frequency) {
      case 'weekly':
        return total + bill.amount * 52 / 12;
      case 'monthly':
        return total + bill.amount;
      case 'yearly':
        return total + bill.amount / 12;
      default:
        return total;
    }
  }, 0);
}

export async function markBillAsPaid(
  bill: Bill,
  userId: string
): Promise<Bill | null> {
  if (bill.deleted) return null;
  try {
    const paidDate = new Date();
    const payment = applyBillPayment(bill, paidDate);

    const transactionData = {
      userId,
      amount: bill.amount,
      category: bill.category,
      description: `Bill payment: ${bill.name}`,
      type: 'expense' as const,
      date: paidDate,
      billId: bill.id,
      createdAt: serverTimestamp(),
    };

    // The bill update and its expense transaction commit atomically: either
    // both persist or neither does, so a failed write can never advance the
    // bill without a matching expense record (or double-charge on retry).
    const batch = writeBatch(db);
    batch.update(doc(db, 'bills', bill.id), payment);
    batch.set(doc(collection(db, 'transactions')), transactionData);
    await batch.commit();

    return { ...bill, ...payment };
  } catch (error) {
    console.error('Error marking bill as paid:', error);
    handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    return null;
  }
}

export function generateRecurringSchedule(
  bill: Bill,
  reference: Date = new Date(),
  occurrences = 6
): string[] {
  if (bill.isPaid && !isRecurringFrequency(bill.frequency)) {
    return [];
  }

  const schedule: string[] = [];
  const start = toDate(bill.nextDueDate || bill.dueDate) || startOfDay(reference);
  const originalDay = start.getDate();
  let next = startOfDay(start);
  for (let i = 0; i < occurrences; i++) {
    schedule.push(next.toISOString());
    if (!isRecurringFrequency(bill.frequency)) break;
    next = advanceByFrequency(next, bill.frequency, originalDay);
  }
  return schedule;
}
