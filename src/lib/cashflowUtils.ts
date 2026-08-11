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
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
}

// Single source of truth for the observation/projection window so the fetch
// count, the averaging divisor, and the projected month count cannot drift.
export const FORECAST_WINDOW_MONTHS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeDescriptionKey(description: string | undefined): string {
  return (description || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function inferRecurrenceFrequency(
  dates: Date[],
): RecurringTransaction["frequency"] {
  if (dates.length < 2) return "monthly";
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i].getTime() - sorted[i - 1].getTime()) / DAY_MS);
  }
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[mid];

  if (median >= 5 && median <= 10) return "weekly";
  if (median >= 25 && median <= 35) return "monthly";
  if (median >= 85 && median <= 95) return "quarterly";
  if (median >= 350 && median <= 380) return "yearly";
  return "monthly";
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

// Starts at the month AFTER the current one: the current, still-running month
// already appears in the observation window, so it must not also be projected
// as a full month.
function getNextMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    months.push(getMonthKey(d));
  }
  return months;
  // Shared forecast-window convention: forecast months start at the NEXT
  // calendar month so the cash-flow engine agrees with the Forecast
  // Comparison engine (issue #900).
  return getForecastMonths(count);
}

export async function fetchUserTransactions(
  userId: string,
  months: number = FORECAST_WINDOW_MONTHS,
): Promise<Transaction[]> {
  if (!userId) return [];
  const now = new Date();
  // Exactly `months` calendar months: the current month plus the preceding
  // `months - 1`, so the averaging divisor below always matches the window.
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
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
      const fallbackStartDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
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
  windowMonths: number = FORECAST_WINDOW_MONTHS,
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
  // rate. The divisor is always windowMonths so projections span exactly the
  // requested window regardless of how many months contain transactions.
  const divisor = windowMonths > 0 ? windowMonths : 1;
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
  // sum of up to six months of activity. The forecast starts at the month
  // after the current one, so every projected month advances the balance and
  // the displayed balance is consistent with the displayed projected net.
  let currentBalance = startingBalance;

  return forecast.map((f) => {
    currentBalance += f.projectedNet;
    return {
      month: f.month,
      projectedBalance: Math.round(currentBalance * 100) / 100,
    };
  });
}

export function identifyRecurringTransactions(
  transactions: Transaction[],
): RecurringTransaction[] {
  type Group = {
    key: string;
    category: string;
    type: "income" | "expense";
    txns: Transaction[];
  };
  const groups: Group[] = [];

  transactions.forEach((t) => {
    const key = normalizeDescriptionKey(t.description) || t.category;
    let group: Group | null = null;
    for (const g of groups) {
      if (g.type !== t.type) continue;
      const exactMatch = g.key === key;
      const textMatch = g.key.includes(key) || key.includes(g.key);
      const amountMatch = g.txns.some(
        (gt) =>
          Math.abs(gt.amount - t.amount) <
          0.01 * Math.max(1, Math.abs(gt.amount)),
      );
      if (exactMatch || (textMatch && amountMatch)) {
        group = g;
        break;
      }
    }
    if (group) {
      group.txns.push(t);
    } else {
      groups.push({ key, category: t.category, type: t.type, txns: [t] });
    }
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
  groups.forEach((group) => {
    if (group.txns.length < 3) return;

    // A charge that appears once a quarter must still span distinct months.
    // Clusters confined to a single month (e.g. three coffees in one week or
    // a burst of purchases around a holiday) are not recurring.
    const distinctMonths = new Set(group.txns.map((t) => getMonthKey(t.date)));
    if (distinctMonths.size < 2) return;

    const avg =
      group.txns.reduce((sum, t) => sum + t.amount, 0) / group.txns.length;
    const variance =
      group.txns.reduce((sum, t) => sum + Math.abs(t.amount - avg), 0) /
      group.txns.length;
    if (avg === 0 || variance / Math.abs(avg) >= 0.3) return;

    recurring.push({
      category: group.category,
      type: group.type,
      averageAmount: Math.round(avg * 100) / 100,
      frequency: inferRecurrenceFrequency(group.txns.map((t) => t.date)),
    });
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
  const dataScore = Math.min(monthsWithData / FORECAST_WINDOW_MONTHS, 1) * 40;
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
