/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  orderBy,
  deleteDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
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
  suggestedLimit: number;
  confidenceScore: number;
  reasoning: string;
}

export interface BudgetComparison {
  category: string;
  previousMonthSpend: number;
  currentBudget: number;
  percentChange: number;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: string;
  description: string;
}

export async function fetchLast3MonthsTransactions(userId: string): Promise<Transaction[]> {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    
    const q = query(
      collection(db, "transactions"),
      where("ownerId", "==", userId),
      where("date", ">=", Timestamp.fromDate(threeMonthsAgo))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.ownerId || userId,
        amount: data.amount || 0,
        category: data.category || "Other",
        date: data.date?.toDate?.()?.toISOString() || new Date().toISOString(),
        description: data.description || "",
      } as Transaction;
    });
  } catch (error) {
    console.error("Error fetching last 3 months transactions:", error);
    return [];
  }
}

export async function fetchPreviousMonthTransactions(userId: string): Promise<Transaction[]> {
  try {
    const now = new Date();
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const q = query(
      collection(db, "transactions"),
      where("ownerId", "==", userId),
      where("date", ">=", Timestamp.fromDate(startOfPreviousMonth)),
      where("date", "<=", Timestamp.fromDate(endOfPreviousMonth))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.ownerId || userId,
        amount: data.amount || 0,
        category: data.category || "Other",
        date: data.date?.toDate?.()?.toISOString() || new Date().toISOString(),
        description: data.description || "",
      } as Transaction;
    });
  } catch (error) {
    console.error("Error fetching previous month transactions:", error);
    return [];
  }
}

export async function generateBudgetSuggestions(transactions: Transaction[]): Promise<CategoryBudgetSuggestion[]> {
  if (!transactions.length) return [];
  
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  
  for (const tx of transactions) {
    if (!categoryTotals[tx.category]) {
      categoryTotals[tx.category] = { total: 0, count: 0 };
    }
    categoryTotals[tx.category].total += tx.amount;
    categoryTotals[tx.category].count += 1;
  }
  
  const suggestions: CategoryBudgetSuggestion[] = [];
  
  for (const [category, data] of Object.entries(categoryTotals)) {
    const avgMonthly = data.total / 3; // Average over 3 months
    const suggestedLimit = Math.ceil(avgMonthly * 1.2); // Add 20% buffer
    const confidenceScore = Math.min(95, 60 + (data.count * 2)); // Higher count = higher confidence
    
    suggestions.push({
      category,
      suggestedLimit,
      confidenceScore,
      reasoning: `Based on ${data.count} transactions totaling ${data.total.toFixed(2)} over 3 months`,
    });
  }
  
  return suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function calculateTotalBudget(categories: BudgetCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.monthlyLimit, 0);
}

export function calculateConfidenceScore(data: any): number {
  if (!data || !data.transactions) return 50;
  const count = data.transactions.length;
  if (count < 10) return 50 + count * 2;
  if (count < 30) return 70 + (count - 10);
  return Math.min(95, 90 + (count - 30) * 0.5);
}

export async function fetchBudgetFromFirestore(userId: string): Promise<any> {
  try {
    const budgetRef = doc(db, "budgets", userId);
    const snapshot = await getDoc(budgetRef);
    if (snapshot.exists()) {
      return snapshot.data();
    }
    return null;
  } catch (error) {
    console.error("Error fetching budget from Firestore:", error);
    return null;
  }
}

export async function saveBudgetToFirestore(userId: string, data: any): Promise<void> {
  try {
    const budgetRef = doc(db, "budgets", userId);
    await setDoc(budgetRef, {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error("Error saving budget to Firestore:", error);
    throw error;
  }
}

export async function generateBudgetComparison(userId: string): Promise<BudgetComparison[]> {
  try {
    const [previousMonthTxns, categories] = await Promise.all([
      fetchPreviousMonthTransactions(userId),
      fetchBudgetCategories(userId),
    ]);
    
    const categorySpend: Record<string, number> = {};
    for (const tx of previousMonthTxns) {
      categorySpend[tx.category] = (categorySpend[tx.category] || 0) + tx.amount;
    }
    
    const comparisons: BudgetComparison[] = [];
    
    for (const cat of categories) {
      const previousSpend = categorySpend[cat.name] || 0;
      const percentChange = cat.monthlyLimit > 0 
        ? ((previousSpend - cat.monthlyLimit) / cat.monthlyLimit) * 100 
        : 0;
      
      comparisons.push({
        category: cat.name,
        previousMonthSpend: previousSpend,
        currentBudget: cat.monthlyLimit,
        percentChange: Math.round(percentChange * 100) / 100,
      });
    }
    
    return comparisons;
  } catch (error) {
    console.error("Error generating budget comparison:", error);
    return [];
  }
}
