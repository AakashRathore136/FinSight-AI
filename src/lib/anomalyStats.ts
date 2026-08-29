/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from "date-fns";
import { toDate } from "./utils.ts";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  type?: "expense" | "income";
}

export interface CategoryBaseline {
  mean: number;
  stdDev: number;
  monthlyTotals: number[];
}

// Minimum number of observations per category before large-transaction
// anomalies are flagged. Below this the leave-one-out baseline has too few
// comparison points to be statistically meaningful.
export const MIN_LARGE_TRANSACTION_SAMPLES = 4;

export function calculateCategoryBaseline(
  transactions: Transaction[],
): Map<string, CategoryBaseline> | null {
  if (transactions.length === 0) return null;
  const grouped = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const category = transaction.category || "Other";
    grouped.set(category, [...(grouped.get(category) || []), transaction]);
  });

  const baseline = new Map<string, CategoryBaseline>();
  grouped.forEach((items, category) => {
    if (items.length === 0) return;
    const amounts = items.map((item) => Math.abs(item.amount));
    if (amounts.length === 0) return;
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
      const date = toDate(item.date);
      if (!date) return;
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
  const byCategory = new Map<string, Transaction[]>();
  transactions.forEach((transaction) => {
    const category = transaction.category || "Other";
    byCategory.set(category, [
      ...(byCategory.get(category) || []),
      transaction,
    ]);
  });

  return transactions.filter((transaction) => {
    const category = transaction.category || "Other";
    if (!baseline.has(category)) return false;

    const items = byCategory.get(category);
    if (!items || items.length < MIN_LARGE_TRANSACTION_SAMPLES) return false;

    // Leave-one-out baseline: the candidate is excluded from the mean/stdDev
    // it is compared against. A large amount must not be able to inflate its
    // own threshold (a single dominant expense previously never got flagged).
    const amounts = items.map((item) => Math.abs(item.amount));
    const candidateIndex = items.indexOf(transaction);
    const others = amounts.filter((_, index) => index !== candidateIndex);

    const mean =
      others.reduce((sum, amount) => sum + amount, 0) / others.length;
    const variance =
      others.reduce(
        (sum, amount) => sum + Math.pow(amount - mean, 2),
        0,
      ) / others.length;
    const threshold = mean + Math.sqrt(variance) * 2;

    return Math.abs(transaction.amount) > Math.max(threshold, 1000);
  });
}
