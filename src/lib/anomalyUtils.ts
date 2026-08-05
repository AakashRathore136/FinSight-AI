/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { formatCurrency, toDate } from "./utils";
import { format, subMonths, startOfMonth } from "date-fns";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  type?: "expense" | "income";
}

export interface Anomaly {
  id: string;
  userId: string;
  transactionId: string;
  type:
    | "large_transaction"
    | "category_spike"
    | "unusual_pattern"
    | "recurring_change";
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  amount: number;
  averageAmount: number;
  deviation: number;
  description: string;
  date: Date;
  dismissed: boolean;
  createdAt: any;
  comparisonPeriod?: string;
  confidence?: number;
}

export interface AnomalySummary {
  totalAnomalies: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  byCategory: Record<string, number>;
  weeklyData: { week: string; count: number }[];
}

export interface CategoryBaseline {
  mean: number;
  stdDev: number;
  monthlyTotals: number[];
}

export async function fetchAnomalies(
  userId: string,
  includeDismissed: boolean = false,
): Promise<Anomaly[]> {
  try {
    const constraints: any[] = [
      where("userId", "==", userId),
      orderBy("date", "desc"),
    ];
    if (!includeDismissed) constraints.push(where("dismissed", "==", false));
    const snap = await getDocs(
      query(collection(db, "anomalies"), ...constraints),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Anomaly);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "anomalies");
    return [];
  }
}

export async function dismissAnomaly(anomalyId: string): Promise<void> {
  try {
    await setDoc(
      doc(db, "anomalies", anomalyId),
      { dismissed: true },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, "anomalies/" + anomalyId);
  }
}

export async function dismissAllAnomalies(userId: string): Promise<void> {
  const anomalies = await fetchAnomalies(userId, false);
  await Promise.all(anomalies.map((a) => dismissAnomaly(a.id)));
}

export async function fetchTransactions(
  userId: string,
  months: number = 6,
): Promise<Transaction[]> {
  const startDate = startOfMonth(subMonths(new Date(), months));
  try {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      where("date", ">=", startDate),
      orderBy("date", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Omit<Transaction, "id">;
      return { ...data, id: d.id } as Transaction;
    });
  } catch (error) {
    if ((error as any)?.code === "failed-precondition") {
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        where("date", ">=", startDate),
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => {
          const data = d.data() as Omit<Transaction, "id">;
          return { ...data, id: d.id } as Transaction;
        })
        .filter((t) => {
          const time = toDate(t.date)?.getTime() ?? 0;
          return time >= startDate.getTime();
        });
    }
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export const fetchUserTransactions = fetchTransactions;

export function calculateCategoryBaseline(
  transactions: Transaction[],
): Map<string, CategoryBaseline> {
  const grouped = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const category = transaction.category || "Other";
    grouped.set(category, [...(grouped.get(category) || []), transaction]);
  });

  const baseline = new Map<string, CategoryBaseline>();
  grouped.forEach((items, category) => {
    const amounts = items.map((item) => Math.abs(item.amount));
    const mean =
      amounts.length > 0
        ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
        : 0;
    const variance =
      amounts.length > 0
        ? amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) /
          amounts.length
        : 0;
    const monthlyTotals = new Map<string, number>();
    items.forEach((item) => {
      const date = toDate(item.date) || new Date();
      const key = format(date, "yyyy-MM");
      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Math.abs(item.amount));
    });

    baseline.set(category, {
      mean,
      stdDev: Math.sqrt(variance),
      monthlyTotals: Array.from(monthlyTotals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, total]) => total),
    });
  });

  return baseline;
}

export function detectLargeTransactions(
  transactions: Transaction[],
  baseline: Map<string, CategoryBaseline>,
): Transaction[] {
  return transactions.filter((transaction) => {
    const categoryBaseline = baseline.get(transaction.category || "Other");
    if (!categoryBaseline) return false;
    const threshold = categoryBaseline.mean + categoryBaseline.stdDev * 2;
    return Math.abs(transaction.amount) > Math.max(threshold, 1000);
  });
}

export function detectCategorySpikes(
  transactions: Transaction[],
  baseline: Map<string, CategoryBaseline>,
): Array<{
  category: string;
  amount: number;
  baseline: CategoryBaseline;
  transactions: Transaction[];
}> {
  const currentMonth = format(new Date(), "yyyy-MM");
  const byCategory = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const date = toDate(transaction.date) || new Date();
    if (format(date, "yyyy-MM") !== currentMonth) return;
    const category = transaction.category || "Other";
    byCategory.set(category, [...(byCategory.get(category) || []), transaction]);
  });

  return Array.from(byCategory.entries())
    .map(([category, items]) => {
      const categoryBaseline = baseline.get(category);
      const amount = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
      return categoryBaseline
        ? { category, amount, baseline: categoryBaseline, transactions: items }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => {
      if (!item || item.baseline.monthlyTotals.length < 2) return false;
      const previousTotals = item.baseline.monthlyTotals.slice(0, -1);
      const average =
        previousTotals.reduce((sum, total) => sum + total, 0) /
        previousTotals.length;
      return average > 0 && item.amount > average * 1.5 && item.amount - average > 500;
    });
}

export function calculateConfidenceScore(
  type: Anomaly["type"],
  amount: number,
  mean: number,
  stdDev: number,
): number {
  const deviation = stdDev > 0 ? Math.abs(amount - mean) / stdDev : amount > mean ? 2 : 0;
  const base = type === "large_transaction" ? 70 : 60;
  return Math.min(95, Math.max(50, Math.round(base + deviation * 10)));
}

export async function checkHistoricalSimilarAnomalies(
  userId: string,
  category: string,
  type: Anomaly["type"],
  amount: number,
): Promise<{ count: number; label: string }> {
  try {
    const snap = await getDocs(
      query(
        collection(db, "anomalies"),
        where("userId", "==", userId),
        where("category", "==", category),
        where("type", "==", type),
      ),
    );
    const count = snap.docs.filter((item) => {
      const existingAmount = Math.abs(Number(item.data().amount || 0));
      return existingAmount > 0 && Math.abs(existingAmount - amount) / existingAmount < 0.25;
    }).length;
    return {
      count,
      label: count === 1 ? "1 similar historical anomaly" : `${count} similar historical anomalies`,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "anomalies");
    return { count: 0, label: "No historical comparison available" };
  }
}

export function detectAnomalies(
  transactions: Transaction[],
): Omit<Anomaly, "id" | "createdAt">[] {
  const anomalies: Omit<Anomaly, "id" | "createdAt">[] = [];
  const categoryAverages = new Map<string, { total: number; count: number }>();
  transactions.forEach((t) => {
    const cat = t.category || "Other";
    const existing = categoryAverages.get(cat) || { total: 0, count: 0 };
    existing.total += Math.abs(t.amount);
    existing.count += 1;
    categoryAverages.set(cat, existing);
  });

  transactions.forEach((t) => {
    const cat = t.category || "Other";
    const avg = categoryAverages.get(cat);
    if (avg && avg.count > 1) {
      const mean = avg.total / avg.count;
      const amount = Math.abs(t.amount);
      if (amount > mean * 3 && amount > 1000) {
        anomalies.push({
          userId: t.userId,
          transactionId: t.id,
          type: "large_transaction",
          severity: amount > mean * 5 ? "critical" : "high",
          category: cat,
          amount,
          averageAmount: Math.round(mean * 100) / 100,
          deviation: Math.round((amount / mean) * 100) / 100,
          description:
            "Large " +
            cat +
            " expense of " +
            formatCurrency(amount) +
            " - " +
            Math.round((amount / mean) * 100) +
            "% above average of " +
            formatCurrency(mean),
          date: t.date,
          dismissed: false,
          confidence: Math.min(95, Math.round((amount / mean - 1) * 25 + 70)),
        });
      }
    }
  });

  const thisMonth = format(new Date(), "yyyy-MM");
  const lastMonth = format(subMonths(new Date(), 1), "yyyy-MM");
  const monthlySpend = new Map<string, Map<string, number>>();
  transactions.forEach((t) => {
    const monthKey = format(
      toDate(t.date) || new Date(),
      "yyyy-MM",
    );
    const cat = t.category || "Other";
    if (!monthlySpend.has(monthKey)) monthlySpend.set(monthKey, new Map());
    const catMap = monthlySpend.get(monthKey)!;
    catMap.set(cat, (catMap.get(cat) || 0) + Math.abs(t.amount));
  });

  const thisMonthData = monthlySpend.get(thisMonth);
  const lastMonthData = monthlySpend.get(lastMonth);
  if (thisMonthData && lastMonthData) {
    thisMonthData.forEach((amount, cat) => {
      const lastAmount = lastMonthData.get(cat) || 0;
      if (
        lastAmount > 0 &&
        amount > lastAmount * 1.5 &&
        amount - lastAmount > 5000
      ) {
        anomalies.push({
          userId: transactions[0]?.userId || "",
          transactionId: "",
          type: "category_spike",
          severity: amount > lastAmount * 2.5 ? "critical" : "medium",
          category: cat,
          amount: Math.round(amount * 100) / 100,
          averageAmount: Math.round(lastAmount * 100) / 100,
          deviation: Math.round((amount / lastAmount) * 100) / 100,
          description:
            cat +
            " spending spike: " +
            formatCurrency(amount) +
            " this month vs " +
            formatCurrency(lastAmount) +
            " last month (" +
            Math.round((amount / lastAmount) * 100) +
            "% increase)",
          date: new Date(),
          dismissed: false,
          comparisonPeriod: "vs " + lastMonth,
          confidence: Math.min(
            90,
            Math.round((amount / lastAmount - 1) * 30 + 60),
          ),
        });
      }
    });
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  anomalies.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
  return anomalies;
}

export function getAnomalySummary(anomalies: Anomaly[]): AnomalySummary {
  const byCategory: Record<string, number> = {};
  let criticalCount = 0,
    highCount = 0,
    mediumCount = 0,
    lowCount = 0;
  anomalies.forEach((a) => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    if (a.severity === "critical") criticalCount++;
    else if (a.severity === "high") highCount++;
    else if (a.severity === "medium") mediumCount++;
    else lowCount++;
  });
  return {
    totalAnomalies: anomalies.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    byCategory,
    weeklyData: [],
  };
}

export async function runAnomalyDetection(
  userId: string,
  transactions: Transaction[],
): Promise<number> {
  const detected = detectAnomalies(transactions);
  let saved = 0;
  for (const anomaly of detected) {
    try {
      await setDoc(doc(collection(db, "anomalies")), {
        ...anomaly,
        date:
          anomaly.date instanceof Date
            ? anomaly.date.toISOString()
            : anomaly.date,
        createdAt: serverTimestamp(),
      });
      saved++;
    } catch (error) {
      console.error("Failed to save anomaly:", error);
    }
  }
  return saved;
}


