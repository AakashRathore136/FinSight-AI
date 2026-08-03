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
  addDoc,
  orderBy,
} from 'firebase/firestore';
import {
  addDays,
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
}

export interface BillInput {
  name: string;
  amount: number;
  dueDate: string;
  frequency: BillFrequency;
  category: string;
}

const UPCOMING_WINDOW_DAYS = 7;

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

  const reference = fromDate ? startOfDay(fromDate) : startOfDay(new Date());
  let next = startOfDay(base);

  while (isBefore(next, reference)) {
    if (frequency === 'weekly') {
      next = addWeeks(next, 1);
    } else if (frequency === 'monthly') {
      next = addMonths(next, 1);
    } else if (frequency === 'yearly') {
      next = addYears(next, 1);
    } else {
      break;
    }
  }

  return next.toISOString();
}

export function isOverdue(bill: Bill, reference: Date = new Date()): boolean {
  if (bill.isPaid) return false;
  const due = toDate(bill.nextDueDate || bill.dueDate);
  if (!due) return false;
  return isBefore(startOfDay(due), startOfDay(reference));
}

export function isUpcoming(bill: Bill, reference: Date = new Date()): boolean {
  if (bill.isPaid || isOverdue(bill, reference)) return false;
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
    if (bill.isPaid) return total;
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
): Promise<boolean> {
  try {
    const paidDate = new Date();
    const nextDueDate = calculateNextDueDate(
      bill.nextDueDate || bill.dueDate,
      bill.frequency,
      paidDate
    );

    await updateDoc(doc(db, 'bills', bill.id), {
      isPaid: false,
      lastPaidDate: paidDate.toISOString(),
      nextDueDate,
    });

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
    await addDoc(collection(db, 'transactions'), transactionData);

    return true;
  } catch (error) {
    console.error('Error marking bill as paid:', error);
    handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    return false;
  }
}

export function generateRecurringSchedule(
  bill: Bill,
  reference: Date = new Date(),
  occurrences = 6
): string[] {
  const schedule: string[] = [];
  let next = toDate(bill.nextDueDate || bill.dueDate) || startOfDay(reference);
  for (let i = 0; i < occurrences; i++) {
    schedule.push(next.toISOString());
    if (bill.frequency === 'weekly') next = addWeeks(next, 1);
    else if (bill.frequency === 'monthly') next = addMonths(next, 1);
    else if (bill.frequency === 'yearly') next = addYears(next, 1);
    else break;
  }
  return schedule;
}
