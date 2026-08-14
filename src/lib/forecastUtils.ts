import {

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { format, intervalsOverlap, startOfMonth, endOfMonth } from 'date-fns';
import { toDate } from './utils';
import { getForecastMonths } from './forecastMonthUtils';
import { csvEscape } from './reportUtils';

export interface ForecastData {
  id: string;
  userId: string;
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  netBalance: number;
  confidence: number;
  createdAt: string;
}

export interface MonthlyForecast {
  month: string;
  income: number;
  expenses: number;
  net: number;
  confidence: number;
}

export interface QuarterlyForecast {
  quarter: string;
  month: string;
  income: number;
  expenses: number;
  net: number;
  confidence: number;
}

export interface ForecastFilter {
  startDate: string;
  endDate: string;
  categories?: string[];
}

export function aggregateTransactionsByMonth(
  transactions: { amount: number; date: unknown; type?: string }[]
): { month: string; income: number; expenses: number }[] {
  const byMonth: Record<string, { income: number; expenses: number }> = {};

  for (const t of transactions) {
    const d = toDate(t.date);
    if (!d) continue;
    const key = format(d, 'yyyy-MM');
    if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
    if (t.type === 'income') byMonth[key].income += t.amount;
    else byMonth[key].expenses += t.amount;
  }

  // Zero-fill every month across the observed span so months without activity
  // are represented (and counted in the averaging divisor) rather than dropped.
  // This keeps the projected monthly rate correct when history has gaps.
  const keys = Object.keys(byMonth).sort();
  if (keys.length > 1) {
    const [firstY, firstM] = keys[0].split('-').map(Number);
    const [lastY, lastM] = keys[keys.length - 1].split('-').map(Number);
    const startIdx = firstY * 12 + (firstM - 1);
    const endIdx = lastY * 12 + (lastM - 1);
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
    }
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}

export function generateMonthlyForecast(
  historicalData: { month: string; income: number; expenses: number }[],
  monthsAhead = 6
): MonthlyForecast[] {
  if (!historicalData.length) {
    return [];
  }

  // Exclude the partial current month and divide by the full calendar span
  // (gap months are zero-filled by aggregateTransactionsByMonth) instead of the
  // count of active months. This matches the cashflow forecast path and keeps
  // the projected monthly rate consistent and not over-stated.
  const currentMonth = format(new Date(), 'yyyy-MM');
  const completed = historicalData.filter((d) => d.month !== currentMonth);
  if (!completed.length) {
    return [];
  }
  const span = completed.length;

  const avgIncome = completed.reduce((s, d) => s + d.income, 0) / span;
  const avgExpenses = completed.reduce((s, d) => s + d.expenses, 0) / span;
  const incomeVariance = Math.sqrt(
    completed.reduce((s, d) => s + Math.pow(d.income - avgIncome, 2), 0) / span
  );
  const expenseVariance = Math.sqrt(
    completed.reduce((s, d) => s + Math.pow(d.expenses - avgExpenses, 2), 0) / span
  );

  // Deterministic forecast: identical history always produces the same
  // projection (no Math.random), so reloads, exports and summaries match.
  const incomeCV = avgIncome > 0 ? incomeVariance / avgIncome : 0;
  const expenseCV = avgExpenses > 0 ? expenseVariance / avgExpenses : 0;
  // Volatility penalty is normalized by the means (coefficient of variation)
  // so confidence is comparable across currencies and income levels instead of
  // being pinned to 0 by high-magnitude absolute variances.
  const volatilityPenalty = (incomeCV + expenseCV) * 100;

  const forecasts: MonthlyForecast[] = [];
  const forecastMonths = getForecastMonths(monthsAhead);
  for (let i = 0; i < monthsAhead; i++) {
    const month = forecastMonths[i];
    const income = avgIncome;
    const expenses = avgExpenses;
    const confidence = Math.max(
      0,
      Math.min(100, 100 - (i * 8) - volatilityPenalty),
    );
    const roundedIncome = Math.round(income);
    const roundedExpenses = Math.round(expenses);
    forecasts.push({
      month,
      income: roundedIncome,
      expenses: roundedExpenses,
      net: roundedIncome - roundedExpenses,
      confidence: Math.round(confidence),
    });
  }
  return forecasts;
}

export function generateQuarterlyForecast(
  monthly: MonthlyForecast[]
): QuarterlyForecast[] {
  const quarters: QuarterlyForecast[] = [];

  const flush = (group: {
    quarter: string;
    month: string;
    income: number;
    expenses: number;
    net: number;
    confidence: number[];
  }) => {
    quarters.push({
      quarter: group.quarter,
      month: group.month,
      income: group.income,
      expenses: group.expenses,
      net: group.net,
      confidence: Math.round(
        group.confidence.reduce((s, c) => s + c, 0) / group.confidence.length,
      ),
    });
  };

  let group: {
    quarter: string;
    month: string;
    income: number;
    expenses: number;
    net: number;
    confidence: number[];
  } | null = null;

  for (const d of monthly) {
    const [year, monthStr] = d.month.split("-");
    const monthNum = Number(monthStr);
    if (!monthNum) continue;
    // Label by the actual calendar quarter and year of the month, not by its
    // array index. A forecast starting in Jul-Aug-Sep is "2026 Q3", Oct-Dec is
    // "2026 Q4" and Jan-Mar the following year is "2027 Q1".
    const quarterLabel = `${year} Q${Math.floor((monthNum - 1) / 3) + 1}`;

    if (!group || group.quarter !== quarterLabel) {
      if (group) flush(group);
      group = {
        quarter: quarterLabel,
        month: d.month,
        income: 0,
        expenses: 0,
        net: 0,
        confidence: [],
      };
    }
    group.income += d.income;
    group.expenses += d.expenses;
    group.net += d.net;
    group.confidence.push(d.confidence);
  }
  if (group) flush(group);

  return quarters;
}

export function calculateNetBalance(income: number, expenses: number): number {
  return income - expenses;
}

export function applyFilters<T extends { month: string }>(
  data: T[],
  filter: ForecastFilter
): T[] {
  return data.filter((d) => {
    const monthDate = toDate(d.month);
    if (!monthDate) return false;
    const start = toDate(filter.startDate);
    const end = toDate(filter.endDate);
    if (!start || !end) return true;
    // Quarterly forecasts are anchored at the first month of the quarter but
    // span three months. Test overlap against the full quarter span so an
    // in-range quarter is not dropped just because its first month precedes
    // the filter start.
    const quarter = (d as { quarter?: string }).quarter;
    if (quarter) {
      const [y, m] = d.month.split('-').map(Number);
      const quarterStart = new Date(y, m - 1, 1);
      const quarterEnd = new Date(y, m - 1 + 3, 0);
      return intervalsOverlap(
        { start: quarterStart, end: quarterEnd },
        { start, end },
      );
    }

    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    return monthStart <= end && monthEnd >= start;
  });
}

export function exportForecastChart(data: MonthlyForecast[]): string {
  const lines = [
    'FinSight AI — Forecast Export',
    '============================',
    '',
    'Month,Income,Expenses,Net Balance,Confidence',
    ...data.map((d) =>
      [csvEscape(d.month), csvEscape(d.income), csvEscape(d.expenses), csvEscape(d.net), csvEscape(d.confidence + '%')].join(','),
    ),
    '',
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
  ];
  return lines.join('\n');
}

export function calculateTrend(data: { month: string; value: number }[]): 'up' | 'down' | 'stable' {
  // Need at least 4 data points to compare two meaningful windows; otherwise
  // the "older" window would be empty (or 1 point) and diff would be biased.
  if (data.length < 4) return 'stable';
  const recent = data.slice(-3).reduce((s, d) => s + d.value, 0) / 3;
  const older = data.slice(0, -3).reduce((s, d) => s + d.value, 0) / (data.length - 3);
  const diff = recent - older;
  if (Math.abs(diff) < older * 0.05) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

export async function getForecasts(userId: string): Promise<ForecastData[]> {
  try {
    const q = query(
      collection(db, 'forecasts'),
      where('userId', '==', userId),
      orderBy('month', 'desc')
    );
    const snapshot = await getDocs(q);
    const forecasts: ForecastData[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      forecasts.push({
        id: docSnap.id,
        userId: data.userId || '',
        month: data.month || '',
        projectedIncome: data.projectedIncome || 0,
        projectedExpenses: data.projectedExpenses || 0,
        netBalance: data.netBalance || 0,
        confidence: data.confidence || 0,
        createdAt: data.createdAt || '',
      } as ForecastData);
    });
    return forecasts;
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    handleFirestoreError(error, OperationType.LIST, 'forecasts');
    return [];
  }
}

export async function createForecast(userId: string, data: Omit<ForecastData, 'id' | 'userId' | 'createdAt'>): Promise<string> {
  const docRef = doc(collection(db, 'forecasts'));
  await setDoc(docRef, {
    ...data,
    userId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateForecast(forecastId: string, patch: Partial<ForecastData>): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'forecasts', forecastId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating forecast:', error);
    handleFirestoreError(error, OperationType.UPDATE, `forecasts/${forecastId}`);
    return false;
  }
}
