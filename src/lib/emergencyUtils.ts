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
  orderBy,
} from 'firebase/firestore';
import { addMonths, differenceInCalendarDays, isBefore } from 'date-fns';
import { db, handleFirestoreError, OperationType } from './firebase';
import { toDate } from './utils';

export const DEFAULT_MIN_MONTHS = 3;
export const DEFAULT_MAX_MONTHS = 6;

export interface Contribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface EmergencyFund {
  id: string;
  userId: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  monthsCovered: number;
  estimatedCompletionDate: string | null;
  reminderEnabled: boolean;
  reminderDayOfMonth: number;
  contributions: Contribution[];
  createdAt: string;
  updatedAt: string;
}

export type EmergencyFundInput = Omit<
  EmergencyFund,
  'id' | 'createdAt' | 'updatedAt' | 'contributions'
> & {
  contributions?: Contribution[];
};

export function calculateRecommendedTarget(
  monthlyExpenses: number,
  months = DEFAULT_MAX_MONTHS
): number {
  if (!monthlyExpenses || monthlyExpenses <= 0) return 0;
  const clamped = Math.min(Math.max(months, DEFAULT_MIN_MONTHS), DEFAULT_MAX_MONTHS);
  return Math.round(monthlyExpenses * clamped);
}

export function calculateMonthlySavings(
  targetAmount: number,
  currentAmount = 0,
  targetMonths?: number,
  completionDate?: string | null
): number {
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (remaining === 0) return 0;

  let months = targetMonths;
  if (!months && completionDate) {
    months = estimateMonthsToCompletion(targetAmount, currentAmount, completionDate);
  }
  if (!months || months <= 0) months = DEFAULT_MAX_MONTHS;

  return Math.ceil(remaining / months);
}

export function estimateMonthsToCompletion(
  targetAmount: number,
  currentAmount = 0,
  completionDate: string | null
): number {
  if (!completionDate) return 0;
  const target = toDate(completionDate);
  if (!target) return 0;
  const days = differenceInCalendarDays(target, new Date());
  return Math.max(0, Math.round(days / 30));
}

export function estimateCompletionDate(
  targetAmount: number,
  currentAmount = 0,
  monthlyContribution: number
): string | null {
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (remaining <= 0) return null;
  if (monthlyContribution <= 0) return null;

  const months = Math.ceil(remaining / monthlyContribution);
  return addMonths(new Date(), months).toISOString();
}

export function getProgressPercentage(
  currentAmount: number,
  targetAmount: number
): number {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentAmount / targetAmount) * 100));
}

export interface ContributionResult {
  fund: EmergencyFund | null;
  contribution: Contribution | null;
}

export function trackContribution(
  fund: EmergencyFund,
  amount: number,
  note?: string
): ContributionResult {
  if (!fund || Number.isNaN(amount) || amount <= 0) {
    return { fund: null, contribution: null };
  }

  const contribution: Contribution = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: Math.round(amount * 100) / 100,
    date: new Date().toISOString(),
    note: note?.trim() || undefined,
  };

  const currentAmount = Math.max(0, fund.currentAmount + contribution.amount);
  const monthlyContribution = fund.monthlyContribution || 0;
  const estimatedCompletionDate = estimateCompletionDate(
    fund.targetAmount,
    currentAmount,
    monthlyContribution
  );

  const updated: EmergencyFund = {
    ...fund,
    currentAmount,
    estimatedCompletionDate,
    contributions: [contribution, ...(fund.contributions || [])],
  };

  return { fund: updated, contribution };
}

export async function getEmergencyFund(userId: string): Promise<EmergencyFund | null> {
  try {
    const ref = collection(db, 'emergency_funds');
    const q = query(
      ref,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return normalizeFund(snapshot.docs[0].id, data);
  } catch (error) {
    console.error('Error fetching emergency fund:', error);
    handleFirestoreError(error, OperationType.LIST, 'emergency_funds');
    return null;
  }
}

export async function createEmergencyFund(
  input: EmergencyFundInput
): Promise<EmergencyFund | null> {
  try {
    const id = doc(collection(db, 'emergency_funds')).id;
    const fund: EmergencyFund = {
      ...input,
      contributions: input.contributions || [],
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'emergency_funds', id), {
      ...fund,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return fund;
  } catch (error) {
    console.error('Error creating emergency fund:', error);
    handleFirestoreError(error, OperationType.CREATE, 'emergency_funds');
    return null;
  }
}

export async function updateEmergencyFund(
  fundId: string,
  patch: Partial<EmergencyFund>
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'emergency_funds', fundId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating emergency fund:', error);
    handleFirestoreError(error, OperationType.UPDATE, `emergency_funds/${fundId}`);
    return false;
  }
}

export async function addContribution(
  fund: EmergencyFund,
  amount: number,
  note?: string
): Promise<EmergencyFund | null> {
  const result = trackContribution(fund, amount, note);
  if (!result.fund || !result.contribution) return null;
  const ok = await updateEmergencyFund(fund.id, {
    currentAmount: result.fund.currentAmount,
    estimatedCompletionDate: result.fund.estimatedCompletionDate,
    contributions: result.fund.contributions,
  });
  return ok ? result.fund : null;
}

function normalizeFund(id: string, data: any): EmergencyFund {
  const rawContributions = Array.isArray(data.contributions) ? data.contributions : [];
  const contributions: Contribution[] = rawContributions.map((c: any) => ({
    id: c.id || `${Math.random().toString(36).slice(2, 9)}`,
    amount: c.amount || 0,
    date: c.date || new Date().toISOString(),
    note: c.note || undefined,
  }));

  return {
    id,
    userId: data.userId || '',
    targetAmount: data.targetAmount || 0,
    currentAmount: data.currentAmount || 0,
    monthlyContribution: data.monthlyContribution || 0,
    monthsCovered: data.monthsCovered || 0,
    estimatedCompletionDate: data.estimatedCompletionDate || null,
    reminderEnabled: data.reminderEnabled || false,
    reminderDayOfMonth: data.reminderDayOfMonth || 1,
    contributions,
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || '',
  };
}

export function isFundComplete(fund: EmergencyFund): boolean {
  return fund.currentAmount >= fund.targetAmount;
}
