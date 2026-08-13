/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
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
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Transaction } from './anomalyUtils';
import { normalizeTransactionType } from './utils';

export interface HealthMetric {
  name: string;
  value: number;
  score: number;
  weight: number;
  description: string;
}

export type HealthCategory = 'Poor' | 'Fair' | 'Good' | 'Excellent';

export interface HealthScore {
  id: string;
  userId: string;
  overallScore: number;
  spendingScore: number;
  savingsScore: number;
  budgetAdherenceScore: number;
  metrics: HealthMetric[];
  month: string;
  createdAt: string;
  updatedAt: string;
}

export type HealthScoreInput = Omit<
  HealthScore,
  'id' | 'createdAt' | 'updatedAt'
>;

const SCORE_WEIGHTS = {
  spending: 0.35,
  savings: 0.35,
  budgetAdherence: 0.3,
};

export function getScoreLabel(score: number): HealthCategory {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

export function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#6366f1';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

export function calculateSpendingScore(transactions: Transaction[]): number {
  const expenses = transactions.filter(
    (t) => normalizeTransactionType(t.type) === 'expense',
  );
  if (expenses.length === 0) return 100;

  const totalSpent = expenses.reduce((sum, t) => sum + t.amount, 0);
  const categoryCount = new Set(expenses.map((t) => t.category)).size;

  const avgTransactionSize = totalSpent / expenses.length;
  const discretionary = expenses
    .filter((t) => ['Entertainment', 'Shopping', 'Dining'].includes(t.category))
    .reduce((sum, t) => sum + t.amount, 0);
  const discretionaryRatio = totalSpent > 0 ? discretionary / totalSpent : 0;

  const uniquePayees = new Set(expenses.map((t) => t.description?.toLowerCase().trim()).filter(Boolean)).size;
  const concentration = uniquePayees <= expenses.length * 0.5 ? 0.9 : 1;

  let score = 100;
  if (avgTransactionSize > totalSpent * 0.3) score -= 15;
  if (discretionaryRatio > 0.5) score -= 20;
  if (discretionaryRatio > 0.35) score -= 10;
  if (categoryCount < 3) score -= 10;
  if (concentration < 1) {
    score = Math.round(score * 0.9);
  }

  return Math.min(100, Math.max(0, score));
}

export function calculateSavingsScore(transactions: Transaction[]): number {
  const expenses = transactions.filter(
    (t) => normalizeTransactionType(t.type) === 'expense',
  );
  const income = transactions.filter((t) => t.type === 'income');

  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);

  if (totalIncome <= 0) return totalExpenses <= 0 ? 100 : 20;

  const savingsRate = (totalIncome - totalExpenses) / totalIncome;
  let score = Math.round(savingsRate * 400);

  const largeExpenses = expenses.filter((t) => t.amount > totalIncome * 0.1).length;
  if (largeExpenses > 3) score -= 10;
  if (savingsRate < 0) score = Math.max(0, score);

  return Math.min(100, Math.max(0, score));
}

export function calculateBudgetAdherence(
  transactions: Transaction[],
  budgetCategories: Array<{
    name: string;
    monthlyLimit: number;
    rolledOverAmount?: number;
    rolloverEnabled?: boolean;
  }>
): number {
  if (budgetCategories.length === 0) return 70;

  const expenses = transactions.filter(
    (t) => normalizeTransactionType(t.type) === 'expense',
  );
  const categorySpend = new Map<string, number>();
  expenses.forEach((t) => {
    categorySpend.set(t.category, (categorySpend.get(t.category) || 0) + t.amount);
  });

  let totalAdherence = 0;
  let counted = 0;

  budgetCategories.forEach((cat) => {
    const spent = categorySpend.get(cat.name) || 0;
    // The effective limit includes any surplus carried over from a previous month.
    // Without this, rolled-over funds are persisted but never counted as available
    // budget, so the rollover feature becomes a no-op for adherence scoring.
    const effectiveLimit = cat.rolloverEnabled
      ? cat.monthlyLimit + Math.max(0, cat.rolledOverAmount || 0)
      : cat.monthlyLimit;
    if (effectiveLimit <= 0) return;
    const ratio = spent / effectiveLimit;
    // Monotonic adherence: every step over budget must strictly lower the
    // score. A single linear penalty (100 - ratio * 20, capped at 0) keeps
    // the curve continuous and monotonically decreasing, so spending 105% of
    // a limit can never outscore spending exactly 100%.
    const adherence = Math.max(0, 100 - ratio * 20);
    totalAdherence += Math.max(0, adherence);
    counted++;
  });

  if (counted === 0) return 70;
  return Math.min(100, Math.max(0, Math.round(totalAdherence / counted)));
}

export function calculateOverallScore(
  spendingScore: number,
  savingsScore: number,
  budgetAdherenceScore: number
): number {
  const overall =
    spendingScore * SCORE_WEIGHTS.spending +
    savingsScore * SCORE_WEIGHTS.savings +
    budgetAdherenceScore * SCORE_WEIGHTS.budgetAdherence;
  return Math.min(100, Math.max(0, Math.round(overall)));
}

export function generateImprovementSuggestions(
  metrics: HealthMetric[]
): { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] {
  const suggestions: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] = [];

  metrics.forEach((metric) => {
    if (metric.score >= 80) return;

    if (metric.name === 'Spending' && metric.score < 60) {
      suggestions.push({
        title: 'Reduce discretionary spending',
        description: 'Your spending patterns show high discretionary costs. Review entertainment and dining expenses.',
        priority: 'high',
      });
    }
    if (metric.name === 'Savings' && metric.score < 50) {
      suggestions.push({
        title: 'Increase your savings rate',
        description: 'Your savings rate is below healthy levels. Aim to save at least 20% of your income.',
        priority: 'high',
      });
    }
    if (metric.name === 'Budget Adherence' && metric.score < 60) {
      suggestions.push({
        title: 'Stick to your budget limits',
        description: 'You are exceeding budget categories. Consider adjusting limits or reducing category spend.',
        priority: 'medium',
      });
    }
  });

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Maintain your healthy habits',
      description: 'Your financial health is strong. Keep tracking and reviewing your progress monthly.',
      priority: 'low',
    });
  }

  return suggestions;
}

export function compareMonthlyScores(
  current: HealthScore,
  previous?: HealthScore
): { overall: number; spending: number; savings: number; budgetAdherence: number } {
  if (!previous) {
    return { overall: 0, spending: 0, savings: 0, budgetAdherence: 0 };
  }

  return {
    overall: current.overallScore - previous.overallScore,
    spending: current.spendingScore - previous.spendingScore,
    savings: current.savingsScore - previous.savingsScore,
    budgetAdherence: current.budgetAdherenceScore - previous.budgetAdherenceScore,
  };
}

export async function getHealthScores(userId: string, limitCount: number = 12): Promise<HealthScore[]> {
  try {
    const ref = collection(db, 'health_scores');
    const q = query(
      ref,
      where('userId', '==', userId),
      orderBy('month', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    const scores: HealthScore[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      scores.push(normalizeScore(docSnap.id, data));
    });
    return scores;
  } catch (error) {
    console.error('Error fetching health scores:', error);
    handleFirestoreError(error, OperationType.LIST, 'health_scores');
    return [];
  }
}

export async function createHealthScore(input: HealthScoreInput): Promise<HealthScore | null> {
  try {
    const id = doc(collection(db, 'health_scores')).id;
    const score: HealthScore = {
      ...input,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'health_scores', id), {
      ...score,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return score;
  } catch (error) {
    console.error('Error creating health score:', error);
    handleFirestoreError(error, OperationType.CREATE, 'health_scores');
    return null;
  }
}

export async function updateHealthScore(
  scoreId: string,
  patch: Partial<HealthScore>
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'health_scores', scoreId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating health score:', error);
    handleFirestoreError(error, OperationType.UPDATE, `health_scores/${scoreId}`);
    return false;
  }
}

function normalizeScore(id: string, data: any): HealthScore {
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  return {
    id,
    userId: data.userId || '',
    overallScore: data.overallScore || 0,
    spendingScore: data.spendingScore || 0,
    savingsScore: data.savingsScore || 0,
    budgetAdherenceScore: data.budgetAdherenceScore || 0,
    metrics: metrics.map((m: any) => ({
      name: m.name || '',
      value: m.value || 0,
      score: m.score || 0,
      weight: m.weight || 0,
      description: m.description || '',
    })),
    month: data.month || '',
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || '',
  };
}
