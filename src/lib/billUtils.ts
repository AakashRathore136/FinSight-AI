import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";

export interface Bill {
  id: string;
  userId: string;
  name: string;
  amount: number;
  dueDate: string;
  frequency: "monthly" | "weekly" | "yearly" | "custom";
  category: string;
  isPaid: boolean;
  lastPaidDate?: string;
  createdAt: string;
  nextDueDate?: string;
}

export type BillFrequency = Bill["frequency"];

export async function fetchUserBills(userId: string): Promise<Bill[]> {
  if (!userId) return [];
  try {
    const billsRef = collection(db, "bills");
    const q = query(
      billsRef,
      where("userId", "==", userId),
      orderBy("dueDate", "asc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        name: data.name,
        amount: Number(data.amount) || 0,
        dueDate: data.dueDate,
        frequency: data.frequency || "monthly",
        category: data.category || "Bills",
        isPaid: data.isPaid || false,
        lastPaidDate: data.lastPaidDate,
        createdAt: data.createdAt,
        nextDueDate: data.nextDueDate,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "bills");
    return [];
  }
}

export async function createBill(bill: Omit<Bill, "id">): Promise<string> {
  try {
    const ref = await addDoc(collection(db, "bills"), {
      ...bill,
      createdAt: bill.createdAt || new Date().toISOString(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "bills");
    throw error;
  }
}

export async function updateBill(
  billId: string,
  data: Partial<Bill>,
): Promise<void> {
  try {
    await updateDoc(doc(db, "bills", billId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    throw error;
  }
}

export async function deleteBill(billId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "bills", billId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bills/${billId}`);
    throw error;
  }
}

export async function markBillAsPaid(billId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "bills", billId), {
      isPaid: true,
      lastPaidDate: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    throw error;
  }
}

export function calculateNextDueDate(
  dueDate: string,
  frequency: BillFrequency,
): string {
  const date = new Date(dueDate);
  const now = new Date();
  let next = new Date(date);

  while (next <= now) {
    switch (frequency) {
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        next.setDate(next.getDate() + 30);
    }
  }

  return next.toISOString().split("T")[0];
}

export function isOverdue(dueDate: string, isPaid: boolean): boolean {
  if (isPaid) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  return due < today;
}

export function isUpcoming(dueDate: string, days: number = 7): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

export function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = due.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getUpcomingBills(bills: Bill[], days: number = 7): Bill[] {
  return bills.filter((b) => !b.isPaid && isUpcoming(b.dueDate, days));
}

export function getOverdueBills(bills: Bill[]): Bill[] {
  return bills.filter((b) => !b.isPaid && isOverdue(b.dueDate, false));
}

export function calculateMonthlyObligations(bills: Bill[]): number {
  return bills
    .filter((b) => !b.isPaid)
    .reduce((total, b) => {
      if (b.frequency === "monthly") return total + b.amount;
      if (b.frequency === "weekly") return total + b.amount * 4;
      if (b.frequency === "yearly") return total + b.amount / 12;
      return total + b.amount;
    }, 0);
}

export function generateRecurringSchedule(
  bills: Bill[],
): { day: string; count: number }[] {
  const schedule: Record<string, number> = {};
  bills.forEach((b) => {
    const date = new Date(b.dueDate);
    const day = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    schedule[day] = (schedule[day] || 0) + 1;
  });
  return Object.entries(schedule)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
