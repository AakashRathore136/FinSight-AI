import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  type: "income" | "expense";
  date: Date;
  description?: string;
}

export type PeriodType = "week" | "month" | "quarter" | "year";

function getPeriodKey(date: Date, period: PeriodType): string {
  switch (period) {
    case "week":
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      return start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    case "month":
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    case "quarter":
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `Q${q} ${date.getFullYear()}`;
    case "year":
      return date.getFullYear().toString();
  }
}

export async function fetchUserTransactions(
  userId: string,
  months: number = 6,
): Promise<Transaction[]> {
  if (!userId) return [];
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const transactionsRef = collection(db, "transactions");
    const q = query(
      transactionsRef,
      where("userId", "==", userId),
      where("date", ">=", Timestamp.fromDate(startDate)),
      orderBy("date", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      let date: Date;
      if (data.date instanceof Timestamp) {
        date = data.date.toDate();
      } else if (data.date instanceof Date) {
        date = data.date;
      } else if (
        typeof data.date === "string" ||
        typeof data.date === "number"
      ) {
        date = new Date(data.date);
      } else {
        date = new Date();
      }
      return {
        id: doc.id,
        userId: data.userId || "",
        amount: Number(data.amount) || 0,
        category: data.category || "Other",
        type: data.type === "income" ? "income" : "expense",
        date,
        description: data.description,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export function generateMonthlyComparison(
  transactions: Transaction[],
  period: PeriodType,
): any[] {
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const grouped: Record<string, Record<string, number>> = {};

  expenseTx.forEach((t) => {
    const periodKey = getPeriodKey(t.date, period);
    if (!grouped[periodKey]) grouped[periodKey] = {};
    grouped[periodKey][t.category] =
      (grouped[periodKey][t.category] || 0) + t.amount;
  });

  return Object.entries(grouped)
    .map(([month, data]) => ({
      month,
      ...data,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function generateWeeklyComparison(transactions: Transaction[]): any[] {
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const grouped: Record<string, Record<string, number>> = {};

  expenseTx.forEach((t) => {
    const weekKey = getPeriodKey(t.date, "week");
    if (!grouped[weekKey]) grouped[weekKey] = {};
    grouped[weekKey][t.category] =
      (grouped[weekKey][t.category] || 0) + t.amount;
  });

  return Object.entries(grouped)
    .map(([week, data]) => ({
      week,
      ...data,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

export function generateCategoryDistribution(
  transactions: Transaction[],
  period: PeriodType,
): any[] {
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const categoryTotals: Record<string, number> = {};

  expenseTx.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  return Object.entries(categoryTotals)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

export function generateTrendLines(
  transactions: Transaction[],
  period: PeriodType,
): any[] {
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const categories = Array.from(new Set(expenseTx.map((t) => t.category)));
  const grouped: Record<string, Record<string, number>> = {};

  expenseTx.forEach((t) => {
    const periodKey = getPeriodKey(t.date, period);
    if (!grouped[periodKey]) grouped[periodKey] = {};
    grouped[periodKey][t.category] =
      (grouped[periodKey][t.category] || 0) + t.amount;
  });

  return Object.entries(grouped)
    .map(([period, data]) => {
      const row: any = { period };
      categories.forEach((cat) => {
        row[cat] = data[cat] || 0;
      });
      return row;
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
