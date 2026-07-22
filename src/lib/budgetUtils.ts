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
