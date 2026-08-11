/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { toDate, normalizeTransactionType } from "@/src/lib/utils";
import { getForecastMonths } from "@/src/lib/forecastMonthUtils";

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

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Classify a recurring transaction's frequency from the median number of days
// between consecutive transactions. within 7 days of 7 => weekly, within 7
// days of 91 => quarterly, otherwise monthly (the default for ~30-day cycles
// and irregular-but-recurring expenses).
function detectFrequency(dates: Date[]): "weekly" | "monthly" | "quarterly" {
  if (dates.length < 2) return "monthly";
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(
      Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / MS_PER_DAY),
    );
  }
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[mid];

  if (Math.abs(median - 7) <= 7) return "weekly";
  if (Math.abs(median - 91) <= 7) return "quarterly";
  return "monthly";
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
  // Shared forecast-window convention: forecast months start at the NEXT
  // calendar month so the cash-flow engine agrees with the Forecast
  // Comparison engine (issue #900).
  return getForecastMonths(count);
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
      const now = new Date();
      const fallbackStartDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        where("date", ">=", Timestamp.fromDate(fallbackStartDate)),
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
  windowMonths: number = 6,
): ForecastData[] {
  if (windowMonths <= 0) return [];
  const months = getNextMonths(windowMonths);
  const incomeByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, Record<string, number>> = {};

  transactions.forEach((t) => {
    const monthKey = getMonthKey(t.date);
    if (t.type === "income") {
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + t.amount;
    } else {
      if (!expenseByMonth[monthKey]) expenseByMonth[monthKey] = {};
      expenseByMonth[monthKey][t.category] =
        (expenseByMonth[monthKey][t.category] || 0) + t.amount;
    }
  });

  // Averages are computed over the full observation window: months without
  // activity are zero-filled so a charge that appears once in the window is
  // projected at its true monthly rate instead of its per-month-with-activity
  // rate. The divisor is the actual number of months observed, not the
  // windowMonths parameter, to correctly reflect the observation period.
  const observedMonthCount = Math.max(
    Object.values(incomeByMonth).length,
    Object.keys(expenseByMonth).length,
  );
  const divisor = observedMonthCount > 0 ? observedMonthCount : 1;
  const avgIncome =
    Object.values(incomeByMonth).length > 0
      ? Object.values(incomeByMonth).reduce((a, b) => a + b, 0) /
        divisor
      : 0;

  const categoryTotals: Record<string, number> = {};
  Object.values(expenseByMonth).forEach((monthData) => {
    Object.entries(monthData).forEach(([cat, amt]) => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    });
  });
  const avgByCategory: Record<string, number> = {};
  Object.entries(categoryTotals).forEach(([cat, total]) => {
    avgByCategory[cat] = total / divisor;
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
  startingBalance: number = 0,
): BalanceProjection[] {
  // Seed with the user's real current account balance. Past net cash flow is
  // NOT used as the seed (it is a cumulative figure, not a balance) so the
  // projection reflects an actual account balance rather than a fabricated
  // sum of up to six months of activity.
  let currentBalance = startingBalance;

  // The current month's projected net is not applied: the current month
  // reports the real starting balance; only future months advance the balance.
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
    { amounts: number[]; dates: Date[]; type: "income" | "expense" }
  > = {};
  transactions.forEach((t) => {
    if (!categoryMap[t.category]) {
      categoryMap[t.category] = { amounts: [], dates: [], type: t.type };
    }
    categoryMap[t.category].amounts.push(t.amount);
    categoryMap[t.category].dates.push(t.date);
  });

  function detectFrequency(dates: Date[]): "weekly" | "monthly" | "quarterly" {
    if (dates.length < 2) return "monthly";
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].getTime() - sorted[i - 1].getTime());
    }
    const medianMs = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const medianDays = medianMs / (1000 * 60 * 60 * 24);
    if (Math.abs(medianDays - 7) <= 5) return "weekly";
    if (Math.abs(medianDays - 30) <= 7) return "monthly";
    if (Math.abs(medianDays - 91) <= 14) return "quarterly";
    return "monthly";
  }

  const recurring: RecurringTransaction[] = [];
  Object.entries(categoryMap).forEach(([category, data]) => {
    if (data.amounts.length >= 3) {
      const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const variance =
        data.amounts.reduce((sum, amt) => sum + Math.abs(amt - avg), 0) /
        data.amounts.length;
      if (avg === 0 || variance / avg < 0.3) {
        recurring.push({
          category,
          type: data.type,
          averageAmount: Math.round(avg * 100) / 100,
          frequency: detectFrequency(data.dates),
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
