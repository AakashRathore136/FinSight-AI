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
  FirestoreError,
} from 'firebase/firestore';
import { db } from './firebase';
import { OperationType, handleFirestoreError } from './firebase';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  subWeeks,
  eachWeekOfInterval,
  eachMonthOfInterval,
} from 'date-fns';

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  type?: 'expense' | 'income';
}

export interface CategoryPeriodDatum {
  category: string;
  [key: string]: string | number;
}

export interface PieDatum {
  name: string;
  value: number;
  color?: string;
}

export interface TrendLinePoint {
  period: string;
  [category: string]: string | number;
}

export type TrendPeriod = 'week' | 'month' | 'quarter' | 'custom';

export interface PeriodConfig {
  type: TrendPeriod;
  startDate: Date;
  endDate: Date;
  label: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#6366f1',
  Groceries: '#8b5cf6',
  Transport: '#ec4899',
  Housing: '#f59e0b',
  Utilities: '#10b981',
  Entertainment: '#06b6d4',
  Health: '#ef4444',
  Shopping: '#14b8a6',
  Travel: '#a855f7',
  Education: '#3b82f6',
  Subscriptions: '#f97316',
  Other: '#64748b',
};

export function getCategoryColor(category: string, fallback = '#6366f1'): string {
  return CATEGORY_COLORS[category] || fallback;
}

export function formatMonthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function formatWeekKey(date: Date): string {
  return format(date, "yyyy-'W'II");
}

export function formatPeriodLabel(period: string, type: TrendPeriod): string {
  if (type === 'month' || period.length === 7) {
    const [y, m] = period.split('-');
    if (y && m) {
      const d = new Date(Number(y), Number(m) - 1, 1);
      return format(d, 'MMM yyyy');
    }
  }
  return period;
}

async function fetchTransactions(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<Transaction[]> {
  try {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Omit<Transaction, 'id'>;
      return { ...data, id: d.id } as Transaction;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `transactions/${userId}`);
    if (error instanceof FirestoreError && error.code === 'failed-precondition') {
      // Index likely missing; fall back to an unfiltered fetch + client side filter
      try {
        const q = query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
        );
        const snap = await getDocs(q);
        return snap.docs
          .map((d) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id } as Transaction))
          .filter((t) => {
            const time = t.date instanceof Date ? t.date.getTime() : new Date(t.date as any).getTime();
            return time >= startDate.getTime() && time <= endDate.getTime();
          });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `transactions/${userId}`);
        return [];
      }
    }
    return [];
  }
}

export async function fetchTransactionsForPeriod(
  userId: string,
  config: PeriodConfig,
): Promise<Transaction[]> {
  return fetchTransactions(userId, config.startDate, config.endDate);
}

export function groupByCategoryAndPeriod(
  transactions: Transaction[],
  config: PeriodConfig,
): CategoryPeriodDatum[] {
  const isMonth = config.type === 'month' || config.type === 'quarter';

  const periods = isMonth
    ? eachMonthOfInterval({ start: config.startDate, end: config.endDate }).map((d) => ({
        key: formatMonthKey(d),
        label: format(d, 'MMM yyyy'),
      }))
    : eachWeekOfInterval({ start: config.startDate, end: config.endDate }).map((d) => ({
        key: formatWeekKey(d),
        label: format(d, "'W'II MMM"),
      }));

  const byCategory = new Map<string, CategoryPeriodDatum>();
  const totals: Record<string, number> = {};

  transactions.forEach((t) => {
    const tDate = t.date instanceof Date ? t.date : new Date(t.date as any);
    const key = isMonth ? formatMonthKey(tDate) : formatWeekKey(tDate);
    if (!byCategory.has(t.category)) {
      const base: CategoryPeriodDatum = { category: t.category };
      periods.forEach((p) => (base[p.key] = 0));
      byCategory.set(t.category, base);
    }
    const row = byCategory.get(t.category)!;
    row[key] = ((row[key] as number) || 0) + Math.abs(t.amount);
    totals[key] = (totals[key] || 0) + Math.abs(t.amount);
  });

  return Array.from(byCategory.values()).sort(
    (a, b) => (b[periods[0]?.key] as number) - (a[periods[0]?.key] as number),
  );
}

export function generateMonthlyComparison(
  transactions: Transaction[],
  months: number = 2,
  end: Date = new Date(),
): { data: CategoryPeriodDatum[]; periods: { key: string; label: string }[] } {
  const start = startOfMonth(subMonths(end, months - 1));
  const periods = eachMonthOfInterval({ start, end }).map((d) => ({
    key: formatMonthKey(d),
    label: format(d, 'MMM yyyy'),
  }));

  const map = new Map<string, CategoryPeriodDatum>();
  transactions.forEach((t) => {
    const tDate = t.date instanceof Date ? t.date : new Date(t.date as any);
    const key = formatMonthKey(tDate);
    if (!key.match(/^\d{4}-\d{2}$/)) return;
    if (!map.has(t.category)) {
      const base: CategoryPeriodDatum = { category: t.category };
      periods.forEach((p) => (base[p.key] = 0));
      map.set(t.category, base);
    }
    const row = map.get(t.category)!;
    row[key] = ((row[key] as number) || 0) + Math.abs(t.amount);
  });

  return {
    periods,
    data: Array.from(map.values()).sort((a, b) => totalOf(b) - totalOf(a)),
  };
}

export function generateWeeklyComparison(
  transactions: Transaction[],
  weeks: number = 4,
  end: Date = new Date(),
): { data: CategoryPeriodDatum[]; periods: { key: string; label: string }[] } {
  const startRange = subWeeks(end, weeks - 1);
  const periods = eachWeekOfInterval({ start: startRange, end: end }).map((d) => ({
    key: formatWeekKey(d),
    label: format(d, "'W'II MMM"),
  }));

  const map = new Map<string, CategoryPeriodDatum>();
  transactions.forEach((t) => {
    const tDate = t.date instanceof Date ? t.date : new Date(t.date as any);
    const key = formatWeekKey(tDate);
    if (!map.has(t.category)) {
      const base: CategoryPeriodDatum = { category: t.category };
      periods.forEach((p) => (base[p.key] = 0));
      map.set(t.category, base);
    }
    const row = map.get(t.category)!;
    row[key] = ((row[key] as number) || 0) + Math.abs(t.amount);
  });

  return {
    periods,
    data: Array.from(map.values()).sort((a, b) => totalOf(b) - totalOf(a)),
  };
}

function totalOf(row: CategoryPeriodDatum): number {
  return Object.entries(row)
    .filter(([k]) => k !== 'category')
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
}

export function calculateCategoryDistribution(
  transactions: Transaction[],
  filterCategory?: string,
): PieDatum[] {
  const totals = new Map<string, number>();
  transactions.forEach((t) => {
    if (filterCategory && t.category !== filterCategory) return;
    totals.set(t.category, (totals.get(t.category) || 0) + Math.abs(t.amount));
  });

  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100 + Number.EPSILON) / 100 }))
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, color: getCategoryColor(d.name) }));
}

export function generateTrendLines(
  transactions: Transaction[],
  months: number = 6,
  end: Date = new Date(),
  filterCategory?: string,
): TrendLinePoint[] {
  const start = startOfMonth(subMonths(end, months - 1));
  const periods = eachMonthOfInterval({ start, end }).map((d) => ({
    key: formatMonthKey(d),
    label: format(d, 'MMM yyyy'),
  }));

  const categories = new Set<string>();
  transactions.forEach((t) => {
    if (filterCategory && t.category !== filterCategory) return;
    categories.add(t.category);
  });

  const matrix = new Map<string, Map<string, number>>();
  periods.forEach((p) => matrix.set(p.key, new Map()));
  transactions.forEach((t) => {
    if (filterCategory && t.category !== filterCategory) return;
    const tDate = t.date instanceof Date ? t.date : new Date(t.date as any);
    const key = formatMonthKey(tDate);
    if (matrix.has(key)) {
      const monthMap = matrix.get(key)!;
      monthMap.set(t.category, (monthMap.get(t.category) || 0) + Math.abs(t.amount));
    }
  });

  return periods.map((p) => {
    const point: TrendLinePoint = { period: p.label };
    categories.forEach((cat) => {
      point[cat] = Math.round((matrix.get(p.key)!.get(cat) || 0) * 100) / 100;
    });
    return point;
  });
}

export function buildPeriodConfig(
  type: TrendPeriod,
  now: Date = new Date(),
  customStart?: Date,
  customEnd?: Date,
): PeriodConfig {
  switch (type) {
    case 'week':
      return {
        type,
        startDate: startOfWeek(now),
        endDate: endOfWeek(now),
        label: `Week of ${format(startOfWeek(now), 'MMM d')}`,
      };
    case 'quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const qStart = startOfMonth(new Date(now.getFullYear(), qStartMonth, 1));
      const qEnd = endOfMonth(new Date(now.getFullYear(), qStartMonth + 2, 1));
      return { type, startDate: qStart, endDate: qEnd, label: `Quarter ${Math.floor(qStartMonth / 3) + 1}` };
    }
    case 'custom':
      return {
        type,
        startDate: customStart || startOfMonth(subMonths(now, 2)),
        endDate: customEnd || now,
        label: `${format(customStart || now, 'MMM d')} - ${format(customEnd || now, 'MMM d')}`,
      };
    case 'month':
    default:
      return {
        type: 'month',
        startDate: startOfMonth(now),
        endDate: endOfMonth(now),
        label: format(now, 'MMMM yyyy'),
      };
  }
}

export async function saveTrendAnalysis(
  userId: string,
  config: PeriodConfig,
  transactions: Transaction[],
): Promise<void> {
  const distribution = calculateCategoryDistribution(transactions);
  const totalSpent = distribution.reduce((sum, d) => sum + d.value, 0);
  const categoryData: Record<string, number> = {};
  const categoryBreakdown: Record<string, { total: number; share: number }> = {};
  distribution.forEach((d) => {
    categoryData[d.name] = d.value;
    categoryBreakdown[d.name] = {
      total: d.value,
      share: totalSpent > 0 ? Math.round((d.value / totalSpent) * 10000) / 100 : 0,
    };
  });

  const periodKey = config.type === 'month' ? formatMonthKey(config.startDate) : formatWeekKey(config.startDate);

  try {
    await setDoc(doc(db, 'trend_analysis', `${userId}_${periodKey}`), {
      userId,
      period: periodKey,
      categoryData,
      totalSpent: Math.round(totalSpent * 100) / 100,
      categoryBreakdown,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `trend_analysis/${userId}_${periodKey}`);
  }
}

export function getUniqueCategories(transactions: Transaction[]): string[] {
  return Array.from(new Set(transactions.map((t) => t.category))).sort();
}
