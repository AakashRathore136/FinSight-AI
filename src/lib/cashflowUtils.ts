import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { toDate, normalizeTransactionType } from "@/src/lib/utils";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  type: "income" | "expense";
  date: Date;
  description?: string;
}

export interface ForecastData {
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNet: number;
  categories: Record<string, number>;
}

export interface BalanceProjection {
  month: string;
  projectedBalance: number;
}

export interface RecurringTransaction {
  category: string;
  type: "income" | "expense";
  averageAmount: number;
  frequency: "weekly" | "monthly" | "quarterly";
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseTransactionDate(raw: unknown): Date {
  if (raw && typeof (raw as any).toDate === "function") {
    return (raw as any).toDate();
  }
  if (raw instanceof Date) return raw;
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw as string | number);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
}

function getNextMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  // Start at +1 so the projection covers only future months. Including the
  // current (partial) month would double-count its already-elapsed activity.
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(getMonthKey(d));
  }
  return months;
}

export async function fetchUserTransactions(
  userId: string,
  months: number = 6,
): Promise<Transaction[]> {
  if (!userId) return [];
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  try {
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
      return {
        id: doc.id,
        userId: data.userId || "",
        amount: Number(data.amount) || 0,
        category: data.category || "Other",
        type: data.type === "income" ? "income" : "expense",
        date: toDate(data.date) || new Date(),
        description: data.description,
      };
    });
  } catch (error) {
    if ((error as any)?.code === "failed-precondition") {
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        where("date", ">=", Timestamp.fromDate(startDate)),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || "",
          amount: Number(data.amount) || 0,
          category: data.category || "Other",
          type: normalizeTransactionType(data.type),
          date: parseTransactionDate(data.date),
          description: data.description,
        };
      });
    }
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export function calculateMonthlyForecast(
  transactions: Transaction[],
): ForecastData[] {
  const months = getNextMonths(6);
  const currentMonth = getMonthKey(new Date());
  const incomeByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, Record<string, number>> = {};

  transactions.forEach((t) => {
    const monthKey = getMonthKey(t.date);
    // Skip the partial current month so its incomplete totals do not
    // deflate the average monthly income/expense used for projection.
    if (monthKey === currentMonth) return;
    if (t.type === "income") {
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + t.amount;
    } else {
      if (!expenseByMonth[monthKey]) expenseByMonth[monthKey] = {};
      expenseByMonth[monthKey][t.category] =
        (expenseByMonth[monthKey][t.category] || 0) + t.amount;
    }
  });

  const avgIncome =
    Object.values(incomeByMonth).length > 0
      ? Object.values(incomeByMonth).reduce((a, b) => a + b, 0) /
        Object.values(incomeByMonth).length
      : 0;

  const categoryTotals: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  Object.values(expenseByMonth).forEach((monthData) => {
    Object.entries(monthData).forEach(([cat, amt]) => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });
  const avgByCategory: Record<string, number> = {};
  Object.entries(categoryTotals).forEach(([cat, total]) => {
    avgByCategory[cat] = total / (categoryCounts[cat] || 1);
  });

  return months.map((month) => {
    const projectedExpenses = Object.values(avgByCategory).reduce(
      (a, b) => a + b,
      0,
    );
    return {
      month,
      projectedIncome: Math.round(avgIncome * 100) / 100,
      projectedExpenses: Math.round(projectedExpenses * 100) / 100,
      projectedNet: Math.round((avgIncome - projectedExpenses) * 100) / 100,
      categories: avgByCategory,
    };
  });
}

export function calculateBalanceProjection(
  transactions: Transaction[],
  forecast: ForecastData[],
): BalanceProjection[] {
  // Seed with the sum of all fetched transactions: today's real balance,
  // which already includes the current (partial) month's activity.
  let currentBalance = 0;
  transactions.forEach((t) => {
    if (t.type === "income") currentBalance += t.amount;
    else currentBalance -= t.amount;
  });

  // The current month's actuals are already folded into currentBalance, so
  // adding its projected net on top would count the month twice. The current
  // month reports the real balance; only future months advance the balance.
  const currentMonth = getMonthKey(new Date());

  return forecast.map((f) => {
    if (f.month !== currentMonth) {
      currentBalance += f.projectedNet;
    }
    return {
      month: f.month,
      projectedBalance: Math.round(currentBalance * 100) / 100,
    };
  });
}

export function identifyRecurringTransactions(
  transactions: Transaction[],
): RecurringTransaction[] {
  const categoryMap: Record<
    string,
    { amounts: number[]; type: "income" | "expense" }
  > = {};
  transactions.forEach((t) => {
    if (!categoryMap[t.category]) {
      categoryMap[t.category] = { amounts: [], type: t.type };
    }
    categoryMap[t.category].amounts.push(t.amount);
  });

  const recurring: RecurringTransaction[] = [];
  Object.entries(categoryMap).forEach(([category, data]) => {
    if (data.amounts.length >= 3) {
      const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const variance =
        data.amounts.reduce((sum, amt) => sum + Math.abs(amt - avg), 0) /
        data.amounts.length;
      if (variance / avg < 0.3) {
        recurring.push({
          category,
          type: data.type,
          averageAmount: Math.round(avg * 100) / 100,
          frequency: "monthly",
        });
      }
    }
  });

  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}

export function calculateConfidenceScore(
  transactions: Transaction[],
  forecast: ForecastData[],
): number {
  if (transactions.length === 0) return 0;
  const monthsWithData = new Set(transactions.map((t) => getMonthKey(t.date)))
    .size;
  const dataScore = Math.min(monthsWithData / 6, 1) * 40;
  const volumeScore = Math.min(transactions.length / 60, 1) * 35;
  const categories = new Set(transactions.map((t) => t.category)).size;
  const diversityScore = Math.min(categories / 10, 1) * 25;
  return Math.round(dataScore + volumeScore + diversityScore);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
