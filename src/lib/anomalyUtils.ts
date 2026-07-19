import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

export interface Transaction {
  id: string;
  userId: string;
  category: string;
  amount: number;
  date: any;
  description: string;
}

export interface Anomaly {
  id?: string;
  userId: string;
  type: 'large_transaction' | 'category_spike' | 'unusual_pattern';
  category: string;
  amount: number;
  description: string;
  confidenceScore: number;
  transactionId: string;
  dismissed: boolean;
  dismissedAt?: any;
  createdAt: any;
}

export interface CategoryBaseline {
  category: string;
  mean: number;
  stdDev: number;
  monthlyTotals: number[];
  count: number;
}

export interface HistoricalAnomaly {
  id: string;
  type: string;
  category: string;
  amount: number;
  createdAt: any;
}

export async function fetchUserTransactions(
  userId: string,
  monthsBack: number = 3
): Promise<Transaction[]> {
  if (!userId) return [];

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  const transactionsQuery = query(
    collection(db, 'transactions'),
    where('userId', '==', userId),
    where('date', '>=', cutoffTimestamp)
  );

  const snapshot = await getDocs(transactionsQuery);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Transaction[];
}

export function calculateCategoryBaseline(
  transactions: Transaction[]
): Map<string, CategoryBaseline> {
  const categoryMap = new Map<string, Transaction[]>();

  transactions.forEach((tx) => {
    const arr = categoryMap.get(tx.category) || [];
    arr.push(tx);
    categoryMap.set(tx.category, arr);
  });

  const baselines = new Map<string, CategoryBaseline>();

  categoryMap.forEach((txs, category) => {
    const amounts = txs.map((t) => t.amount);
    const count = amounts.length;
    const mean = count > 0 ? amounts.reduce((a, b) => a + b, 0) / count : 0;
    const variance =
      count > 0
        ? amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count
        : 0;
    const stdDev = Math.sqrt(variance);

    const monthlyTotals = getMonthlyTotals(txs);

    baselines.set(category, {
      category,
      mean,
      stdDev,
      monthlyTotals,
      count,
    });
  });

  return baselines;
}

export function detectLargeTransactions(
  transactions: Transaction[],
  baseline: Map<string, CategoryBaseline>
): Array<Transaction & { categoryBaseline: CategoryBaseline }> {
  const anomalies: Array<Transaction & { categoryBaseline: CategoryBaseline }> = [];

  transactions.forEach((tx) => {
    const catBaseline = baseline.get(tx.category);
    if (!catBaseline || catBaseline.count < 2) return;

    const threshold = catBaseline.mean + 2 * catBaseline.stdDev;
    if (tx.amount > threshold && threshold > 0) {
      anomalies.push({
        ...tx,
        categoryBaseline: catBaseline,
      });
    }
  });

  return anomalies;
}

export function detectCategorySpikes(
  transactions: Transaction[],
  baseline: Map<string, CategoryBaseline>
): Array<{ category: string; amount: number; transactions: Transaction[]; baseline: CategoryBaseline }> {
  const spikes: Array<{
    category: string;
    amount: number;
    transactions: Transaction[];
    baseline: CategoryBaseline;
  }> = [];

  baseline.forEach((catBaseline, category) => {
    const monthlyTotals = catBaseline.monthlyTotals;
    if (monthlyTotals.length < 2) return;

    const avgMonthlySpend =
      monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length;
    if (avgMonthlySpend <= 0) return;

    const currentMonthTotal = monthlyTotals[monthlyTotals.length - 1];
    const spikeThreshold = avgMonthlySpend * 1.5;

    if (currentMonthTotal > spikeThreshold) {
      const categoryTxns = transactions.filter(
        (t) => t.category === category
      );
      spikes.push({
        category,
        amount: currentMonthTotal,
        transactions: categoryTxns,
        baseline: catBaseline,
      });
    }
  });

  return spikes;
}

export function calculateConfidenceScore(
  type: 'large_transaction' | 'category_spike' | 'unusual_pattern',
  amount: number,
  mean: number,
  stdDev: number
): number {
  if (mean <= 0) return 50;

  const zScore = (amount - mean) / (stdDev || 1);
  const normalizedZ = Math.min(Math.abs(zScore) / 4, 1);

  let baseScore = normalizedZ * 100;

  if (type === 'large_transaction') {
    baseScore = Math.min(100, baseScore * 1.1);
  } else if (type === 'category_spike') {
    baseScore = Math.min(100, baseScore * 0.9);
  }

  return Math.round(Math.min(100, Math.max(0, baseScore)));
}

export async function checkHistoricalSimilarAnomalies(
  userId: string,
  category: string,
  type: string,
  currentAmount: number,
  tolerancePercent: number = 20
): Promise<HistoricalAnomaly[]> {
  if (!userId) return [];

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  const anomaliesQuery = query(
    collection(db, 'anomalies'),
    where('userId', '==', userId),
    where('category', '==', category),
    where('type', '==', type),
    where('dismissed', '==', false),
    where('createdAt', '>=', cutoffTimestamp)
  );

  const snapshot = await getDocs(anomaliesQuery);
  const tolerance = currentAmount * (tolerancePercent / 100);

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as HistoricalAnomaly))
    .filter((a) => Math.abs(a.amount - currentAmount) <= tolerance);
}

function getMonthlyTotals(transactions: Transaction[]): number[] {
  const monthMap = new Map<string, number>();

  transactions.forEach((tx) => {
    const date = toDate(tx.date);
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthMap.set(key, (monthMap.get(key) || 0) + tx.amount);
  });

  return Array.from(monthMap.values()).sort((a, b) => a - b);
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
