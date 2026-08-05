/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  orderBy,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { normalizeTransactionType } from './utils';
import { toDate } from './utils';

export interface BudgetCategory {
  id: string;
  userId: string;
  name: string;
  monthlyLimit: number;
  rolloverEnabled: boolean;
  rolloverPercentage: number;
  rolledOverAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RolloverEntry {
  id: string;
  userId: string;
  fromMonth: string;
  toMonth: string;
  category: string;
  amount: number;
  percentage: number;
  createdAt: string;
}

export interface BudgetCategoryInput {
  name: string;
  monthlyLimit: number;
  rolloverEnabled?: boolean;
  rolloverPercentage?: number;
}

export const DEFAULT_CATEGORIES = [
  'Housing',
  'Food & Dining',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Education',
  'Savings',
  'Other',
];

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getPreviousMonthKey(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export async function fetchBudgetCategories(userId: string): Promise<BudgetCategory[]> {
  try {
    const ref = collection(db, 'budget_categories');
    const q = query(ref, where('userId', '==', userId), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    const categories: BudgetCategory[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      categories.push({
        id: docSnap.id,
        userId: data.userId || '',
        name: data.name || '',
        monthlyLimit: data.monthlyLimit || 0,
        rolloverEnabled: data.rolloverEnabled || false,
        rolloverPercentage: data.rolloverPercentage || 100,
        rolledOverAmount: data.rolledOverAmount || 0,
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
      });
    });
    return categories;
  } catch (error) {
    console.error('Error fetching budget categories:', error);
    handleFirestoreError(error, OperationType.LIST, 'budget_categories');
    return [];
  }
}

export async function createBudgetCategory(
  userId: string,
  input: BudgetCategoryInput
): Promise<BudgetCategory | null> {
  try {
    const id = doc(collection(db, 'budget_categories')).id;
    const now = new Date().toISOString();
    const category: Omit<BudgetCategory, 'id'> = {
      userId,
      name: input.name.trim(),
      monthlyLimit: input.monthlyLimit,
      rolloverEnabled: input.rolloverEnabled ?? false,
      rolloverPercentage: input.rolloverPercentage ?? 100,
      rolledOverAmount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'budget_categories', id), {
      ...category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...category, id };
  } catch (error) {
    console.error('Error creating budget category:', error);
    handleFirestoreError(error, OperationType.CREATE, 'budget_categories');
    return null;
  }
}

export async function updateBudgetCategory(
  id: string,
  updates: Partial<Omit<BudgetCategory, 'id' | 'userId' | 'name' | 'createdAt'>>
): Promise<boolean> {
  try {
    const ref = doc(db, 'budget_categories', id);
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating budget category:', error);
    handleFirestoreError(error, OperationType.UPDATE, `budget_categories/${id}`);
    return false;
  }
}

export async function deleteBudgetCategory(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'budget_categories', id));
    return true;
  } catch (error) {
    console.error('Error deleting budget category:', error);
    handleFirestoreError(error, OperationType.DELETE, `budget_categories/${id}`);
    return false;
  }
}

export async function fetchRolloverHistory(userId: string): Promise<RolloverEntry[]> {
  try {
    const ref = collection(db, 'budget_rollovers');
    const q = query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const entries: RolloverEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      entries.push({
        id: docSnap.id,
        userId: data.userId || '',
        fromMonth: data.fromMonth || '',
        toMonth: data.toMonth || '',
        category: data.category || '',
        amount: data.amount || 0,
        percentage: data.percentage || 0,
        createdAt: data.createdAt || '',
      });
    });
    return entries;
  } catch (error) {
    console.error('Error fetching rollover history:', error);
    handleFirestoreError(error, OperationType.LIST, 'budget_rollovers');
    return [];
  }
}

export async function createRolloverEntry(
  userId: string,
  fromMonth: string,
  toMonth: string,
  category: string,
  amount: number,
  percentage: number
): Promise<RolloverEntry | null> {
  try {
    const id = doc(collection(db, 'budget_rollovers')).id;
    const entry: Omit<RolloverEntry, 'id'> = {
      userId,
      fromMonth,
      toMonth,
      category,
      amount,
      percentage,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'budget_rollovers', id), {
      ...entry,
      createdAt: serverTimestamp(),
    });
    return { ...entry, id };
  } catch (error) {
    console.error('Error creating rollover entry:', error);
    handleFirestoreError(error, OperationType.CREATE, 'budget_rollovers');
    return null;
  }
}

export async function resetAllRollovers(userId: string): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    const ref = collection(db, 'budget_categories');
    const q = query(ref, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        rolledOverAmount: 0,
        rolloverEnabled: false,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error resetting rollovers:', error);
    handleFirestoreError(error, OperationType.WRITE, 'budget_categories');
    return false;
  }
}

export async function resetCategoryRollover(userId: string, categoryId: string): Promise<boolean> {
  try {
    const ref = doc(db, 'budget_categories', categoryId);
    await updateDoc(ref, {
      rolledOverAmount: 0,
      rolloverEnabled: false,
      rolloverPercentage: 100,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error resetting category rollover:', error);
    handleFirestoreError(error, OperationType.UPDATE, `budget_categories/${categoryId}`);
    return false;
  }
}

export function calculateRolloverAmount(unusedBudget: number, percentage: number): number {
  if (unusedBudget <= 0) return 0;
  return Math.round(unusedBudget * (percentage / 100) * 100) / 100;
}

export function getRolloverStats(entries: RolloverEntry[], category?: string) {
  const filtered = category ? entries.filter((e) => e.category === category) : entries;
  const totalRolledOver = filtered.reduce((sum, e) => sum + e.amount, 0);
  const count = filtered.length;
  return { totalRolledOver, count };
}

export function initializeDefaultCategories(userId: string): BudgetCategory[] {
  const now = new Date().toISOString();
  return DEFAULT_CATEGORIES.map((name) => ({
    id: `${userId}_${name.replace(/\s+/g, '_').toLowerCase()}`,
    userId,
    name,
    monthlyLimit: 0,
    rolloverEnabled: false,
    rolloverPercentage: 100,
    rolledOverAmount: 0,
    createdAt: now,
    updatedAt: now,
  }));
}

export { formatCurrency } from './utils';

export interface CategoryBudgetSuggestion {
  category: string;
  suggestedAmount: number;
  modifiedAmount?: number;
  status?: 'accepted' | 'rejected' | 'modified';
  averageSpending: number;
  previousMonthSpending: number;
  confidenceScore: number;
  reasoning: string;
}

export interface BudgetComparison {
  category: string;
  previous: number;
  suggested: number;
  difference: number;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  type?: 'income' | 'expense';
}

async function fetchUserTransactionsInRange(
  userId: string,
  startDate: Date,
  endDate: Date | null,
): Promise<Transaction[]> {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'transactions'), where('userId', '==', userId)),
    );
    const transactions: Transaction[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const dateVal = toDate(data.date);
      if (!dateVal) return;
      if (dateVal.getTime() < startDate.getTime()) return;
      if (endDate && dateVal.getTime() >= endDate.getTime()) return;
      transactions.push({
        id: docSnap.id,
        userId: data.userId || '',
        amount: data.amount || 0,
        category: data.category || 'Other',
        date: dateVal.toISOString(),
        description: data.description || '',
        type: normalizeTransactionType(data.type),
      });
    });
    transactions.sort((a, b) => b.date.localeCompare(a.date));
    return transactions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'transactions');
    return [];
  }
}

export async function fetchLast3MonthsTransactions(userId: string): Promise<Transaction[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return fetchUserTransactionsInRange(userId, startDate, null);
}

export async function fetchPreviousMonthTransactions(userId: string): Promise<Transaction[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return fetchUserTransactionsInRange(userId, startDate, endDate);
}

export async function generateBudgetSuggestions(
  transactions: Transaction[],
  previousSpending?: Record<string, number>,
): Promise<CategoryBudgetSuggestion[]> {
  const expenseTransactions = transactions.filter(
    (t) => t.type === 'expense' || (t.type !== 'income' && t.amount < 0),
  );

  const categoryMonthlyTotals = new Map<string, Map<string, number>>();
  expenseTransactions.forEach((t) => {
    const dateVal = toDate(t.date);
    if (!dateVal) return;
    const monthKey = `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}`;
    const category = t.category || 'Other';
    if (!categoryMonthlyTotals.has(category)) {
      categoryMonthlyTotals.set(category, new Map<string, number>());
    }
    const monthMap = categoryMonthlyTotals.get(category)!;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + Math.abs(t.amount));
  });

  const suggestions: CategoryBudgetSuggestion[] = [];
  categoryMonthlyTotals.forEach((monthMap, category) => {
    const monthlyTotals = Array.from(monthMap.values());
    const averageSpending = monthlyTotals.reduce((sum, v) => sum + v, 0) / monthlyTotals.length;
    const suggestedAmount = Math.max(0, Math.round(averageSpending / 10) * 10);
    const variance =
      monthlyTotals.reduce((sum, v) => sum + Math.pow(v - averageSpending, 2), 0) /
      monthlyTotals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = averageSpending > 0 ? stdDev / averageSpending : 0;

    let confidence = 40;
    if (monthlyTotals.length >= 2) confidence += 20;
    if (monthlyTotals.length >= 3) confidence += 20;
    if (coefficientOfVariation <= 0.5) confidence += 10;

    suggestions.push({
      category,
      suggestedAmount,
      averageSpending: Math.round(averageSpending * 100) / 100,
      previousMonthSpending: previousSpending?.[category] || 0,
      confidenceScore: Math.min(100, confidence),
      reasoning: `Average monthly spend of ${formatCurrency(Math.round(averageSpending))} across ${monthlyTotals.length} month(s) of transaction history.`,
    });
  });

  return suggestions.sort((a, b) => b.averageSpending - a.averageSpending);
}

export function calculateTotalBudget(suggestions: CategoryBudgetSuggestion[]): number {
  return suggestions.reduce((sum, s) => {
    if (s.status === 'rejected') return sum;
    return sum + (s.modifiedAmount ?? s.suggestedAmount);
  }, 0);
}

export function calculateConfidenceScore(
  transactions: Transaction[],
  _averages?: Record<string, number>,
): number {
  if (!transactions || transactions.length === 0) return 35;
  const amounts = transactions.map((t) => Math.abs(t.amount));
  const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
  const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

  let score = 35;
  if (transactions.length >= 5) score += 10;
  if (transactions.length >= 15) score += 10;
  if (transactions.length >= 30) score += 10;
  if (transactions.length >= 60) score += 10;
  if (stdDev === 0) score += 10;
  else if (coefficientOfVariation <= 0.5) score += 10;
  else if (coefficientOfVariation <= 1) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function fetchBudgetFromFirestore(
  userId: string,
  month?: string,
): Promise<any> {
  try {
    const key = month || getCurrentMonthKey();
    const snap = await getDoc(doc(db, 'budgets', `${userId}_${key}`));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'budgets');
    return null;
  }
}

export async function saveBudgetToFirestore(userId: string, data: any): Promise<void> {
  try {
    const month = data.month || getCurrentMonthKey();
    await setDoc(
      doc(db, 'budgets', `${userId}_${month}`),
      {
        ...data,
        userId,
        month,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'budgets');
    throw error;
  }
}

export function generateBudgetComparison(
  suggestions: CategoryBudgetSuggestion[],
  previousSpending: Record<string, number>,
): BudgetComparison[] {
  return suggestions.map((s) => {
    const previous = previousSpending[s.category] || 0;
    const suggested = s.status === 'rejected' ? 0 : (s.modifiedAmount ?? s.suggestedAmount);
    return {
      category: s.category,
      previous,
      suggested,
      difference: suggested - previous,
    };
  });
}
