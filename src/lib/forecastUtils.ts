import {
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
import { format, addMonths, isWithinInterval } from 'date-fns';
import { toDate } from './utils';

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

export function generateMonthlyForecast(
  historicalData: { month: string; income: number; expenses: number }[],
  monthsAhead = 6
): MonthlyForecast[] {
  if (!historicalData.length) {
    return [];
  }

  const avgIncome = historicalData.reduce((s, d) => s + d.income, 0) / historicalData.length;
  const avgExpenses = historicalData.reduce((s, d) => s + d.expenses, 0) / historicalData.length;
  const incomeVariance = Math.sqrt(
    historicalData.reduce((s, d) => s + Math.pow(d.income - avgIncome, 2), 0) / historicalData.length
  );
  const expenseVariance = Math.sqrt(
    historicalData.reduce((s, d) => s + Math.pow(d.expenses - avgExpenses, 2), 0) / historicalData.length
  );

  const forecasts: MonthlyForecast[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const month = format(addMonths(new Date(), i + 1), 'yyyy-MM');
    const income = avgIncome + (Math.random() - 0.5) * incomeVariance;
    const expenses = avgExpenses + (Math.random() - 0.5) * expenseVariance;
    const confidence = Math.max(0, Math.min(100, 100 - (i * 8) - (incomeVariance + expenseVariance) / 100));
    forecasts.push({
      month,
      income: Math.round(income),
      expenses: Math.round(expenses),
      net: Math.round(income - expenses),
      confidence: Math.round(confidence),
    });
  }
  return forecasts;
}

export function generateQuarterlyForecast(
  monthly: MonthlyForecast[]
): QuarterlyForecast[] {
  const quarters: QuarterlyForecast[] = [];
  for (let i = 0; i < monthly.length; i += 3) {
    const slice = monthly.slice(i, i + 3);
    if (slice.length === 0) break;
    const quarter = `${slice[0].month.slice(0, 4)} Q${Math.floor(i / 3) + 1}`;
    quarters.push({
      quarter,
      month: slice[0].month,
      income: slice.reduce((s, d) => s + d.income, 0),
      expenses: slice.reduce((s, d) => s + d.expenses, 0),
      net: slice.reduce((s, d) => s + d.net, 0),
      confidence: Math.round(slice.reduce((s, d) => s + d.confidence, 0) / slice.length),
    });
  }
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
    return isWithinInterval(monthDate, { start, end });
  });
}

export function exportForecastChart(data: MonthlyForecast[]): string {
  const lines = [
    'FinSight AI — Forecast Export',
    '============================',
    '',
    'Month,Income,Expenses,Net Balance,Confidence',
    ...data.map((d) => `${d.month},${d.income},${d.expenses},${d.net},${d.confidence}%`),
    '',
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
  ];
  return lines.join('\n');
}

export function calculateTrend(data: { month: string; value: number }[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';
  const recent = data.slice(-3).reduce((s, d) => s + d.value, 0) / Math.min(3, data.length);
  const older = data.slice(0, -3).reduce((s, d) => s + d.value, 0) / Math.max(1, data.length - 3);
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
