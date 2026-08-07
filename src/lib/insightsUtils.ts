/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * insightsUtils.ts — AI-Powered Spending Insights analytics engine.
 *
 * Provides pure(ish) helpers for:
 *  - Fetching a user's transactions from Firestore across analysis windows
 *  - Detecting spending anomalies (transactions > 2x their category average)
 *  - Identifying savings opportunities (subscriptions, unused categories,
 *    high-frequency small purchases)
 *  - Generating plain-language summaries of spending behaviour
 *  - Calculating category trends (week-over-week, month-over-month)
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  eachMonthOfInterval,
  format,
  differenceInDays,
} from "date-fns";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { toDate } from "@/src/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightType = "weekly" | "monthly" | "anomaly" | "opportunity";
export type Severity = "low" | "medium" | "high";

export interface Transaction {
  id: string;
  userId: string;
  /** Positive number representing amount spent. */
  amount: number;
  category: string;
  description?: string;
  merchant?: string;
  /** Firestore Timestamp | ISO string | epoch millis. Normalized via toDate(). */
  date: any;
}

export interface Insight {
  id: string;
  userId?: string;
  type: InsightType;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  amount: number;
  period: string;
  createdAt: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface CategoryDelta {
  category: string;
  current: number;
  previous: number;
  /** Signed absolute change (current - previous). */
  change: number;
  /** Signed percentage change. `null` when previous is 0 (no baseline). */
  changePct: number | null;
}

export interface PeriodSummary {
  label: string;
  total: number;
  transactionCount: number;
  topCategories: CategoryTotal[];
  previousTotal: number;
  changePct: number | null;
}

export interface TrendPoint {
  /** Human-readable period label (e.g. "Feb 2026"). */
  period: string;
  timestamp: number;
  /** Per-category totals keyed by category name, plus `total`. */
  [category: string]: number | string;
}

export interface InsightsBundle {
  weekly: CategoryDelta[];
  weeklySummary: PeriodSummary;
  monthlySummary: PeriodSummary;
  monthlyDeltas: CategoryDelta[];
  anomalies: Insight[];
  opportunities: Insight[];
  trends: TrendPoint[];
  trendCategories: string[];
  transactionCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () =>
  `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function normalizeAmount(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Treat spending as positive magnitude.
  return Math.abs(n);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function inRange(tx: Transaction, start: Date, end: Date): boolean {
  const d = toDate(tx.date);
  if (!d) return false;
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function sumByCategory(transactions: Transaction[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const tx of transactions) {
    const category = tx.category || "Uncategorized";
    const existing = map.get(category) || { category, total: 0, count: 0 };
    existing.total += normalizeAmount(tx.amount);
    existing.count += 1;
    map.set(category, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function total(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => acc + normalizeAmount(tx.amount), 0);
}

// ---------------------------------------------------------------------------
// 1. Fetch transactions
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for a user. Reads once from the `transactions`
 * collection filtered by `userId`. Filtering by period is performed
 * client-side so a single read powers every analysis window.
 *
 * Returns an empty array (never throws) so the dashboard can render an
 * onboarding/empty state gracefully when no data exists yet.
 */
export async function fetchTransactions(
  userId: string,
): Promise<Transaction[]> {
  if (!userId) return [];
  try {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => {
      const data = doc.data() as Omit<Transaction, "id">;
      return {
        id: doc.id,
        userId: data.userId,
        amount: normalizeAmount(data.amount),
        category: data.category || "Uncategorized",
        description: data.description || "",
        merchant: (data as any).merchant || "",
        date: data.date,
      } as Transaction;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

/** Return transactions that fall within [start, end]. */
export function filterByPeriod(
  transactions: Transaction[],
  start: Date,
  end: Date,
): Transaction[] {
  return transactions.filter((tx) => inRange(tx, start, end));
}

// ---------------------------------------------------------------------------
// 2. Anomaly detection (transactions > 2x category average)
// ---------------------------------------------------------------------------

/**
 * Flag individual transactions whose amount is more than `threshold`x the
 * average spend for their category. Categories need a minimum sample size to
 * avoid flagging noise. Returns anomaly `Insight` objects.
 */
export function detectAnomalies(
  transactions: Transaction[],
  userId?: string,
  threshold = 2,
): Insight[] {
  const byCategory = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.category || "Uncategorized";
    const list = byCategory.get(key) || [];
    list.push(tx);
    byCategory.set(key, list);
  }

  const anomalies: Insight[] = [];
  for (const [category, list] of byCategory.entries()) {
    if (list.length < 3) continue; // need a meaningful baseline
    const avg = total(list) / list.length;
    if (avg <= 0) continue;

    for (const tx of list) {
      const amount = normalizeAmount(tx.amount);
      const ratio = amount / avg;
      if (ratio >= threshold) {
        const severity: Severity =
          ratio >= 4 ? "high" : ratio >= 3 ? "medium" : "low";
        const d = toDate(tx.date);
        const label = tx.merchant || tx.description || category;
        anomalies.push({
          id: uid(),
          userId,
          type: "anomaly",
          category,
          title: `Unusual ${category} charge`,
          description:
            `A ${formatCurrency(amount)} transaction${
              tx.merchant ? ` at ${tx.merchant}` : ""
            } is ${ratio.toFixed(1)}x your typical ${category} spend of ` +
            `${formatCurrency(avg)}. Review "${label}" to confirm it's expected.`,
          severity,
          amount,
          period: d ? format(d, "MMM d, yyyy") : "Recent",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// 3. Savings opportunities
// ---------------------------------------------------------------------------

const SUBSCRIPTION_HINTS = [
  "subscription",
  "netflix",
  "spotify",
  "hulu",
  "disney",
  "prime",
  "youtube",
  "icloud",
  "dropbox",
  "gym",
  "membership",
  "adobe",
  "notion",
  "patreon",
  "audible",
  "apple.com/bill",
];

/**
 * Identify savings opportunities across three heuristics:
 *  1. Recurring subscriptions (same merchant charged on multiple occasions or
 *     merchant/description matches a known subscription keyword).
 *  2. High-frequency small purchases (many small transactions in a category
 *     that quietly add up — e.g. coffee, snacks).
 *  3. Unused / dormant categories (spent historically but nothing in the
 *     most recent 30 days) — flagged as a review-and-cancel candidate only
 *     when it looks recurring.
 */
export function identifyOpportunities(
  transactions: Transaction[],
  userId?: string,
): Insight[] {
  const opportunities: Insight[] = [];
  const now = new Date();

  // --- 1. Subscriptions -----------------------------------------------------
  const merchantGroups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = (tx.merchant || tx.description || "").trim().toLowerCase();
    if (!key) continue;
    const list = merchantGroups.get(key) || [];
    list.push(tx);
    merchantGroups.set(key, list);
  }

  for (const [key, list] of merchantGroups.entries()) {
    const matchesHint = SUBSCRIPTION_HINTS.some((h) => key.includes(h));
    const recurring = list.length >= 3; // charged repeatedly
    if (!matchesHint && !recurring) continue;

    const monthly = total(list) / Math.max(1, list.length);

    // Detect the real cadence from the intervals between charges before
    // annualizing. Every recurring merchant used to be treated as monthly,
    // which inflated weekly savings ~4x and deflated quarterly savings ~3x.
    const sorted = [...list].sort((a, b) => {
      const da = toDate(a.date)?.getTime() ?? 0;
      const db = toDate(b.date)?.getTime() ?? 0;
      return da - db;
    });
    let avgInterval = 0;
    if (sorted.length >= 2) {
      let intervalTotal = 0;
      let intervalCount = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = toDate(sorted[i - 1].date);
        const cur = toDate(sorted[i].date);
        if (!prev || !cur) continue;
        intervalTotal += differenceInDays(cur, prev);
        intervalCount += 1;
      }
      avgInterval = intervalCount > 0 ? intervalTotal / intervalCount : 0;
    }
    // Weekly cadence ≈ 52 charges/year, monthly ≈ 12, quarterly ≈ 4. Charges
    // bunched closer than a week are capped at the weekly rate rather than
    // inflating the annual figure.
    const chargesPerYear = avgInterval >= 1 ? Math.min(52, 365 / avgInterval) : 12;
    const annualized = monthly * chargesPerYear;
    const display = list[0].merchant || list[0].description || key;
    opportunities.push({
      id: uid(),
      userId,
      type: "opportunity",
      category: list[0].category || "Subscriptions",
      title: `Recurring charge: ${display}`,
      description:
        `You've been charged by ${display} ${list.length} times ` +
        `(~${formatCurrency(monthly)}/charge). Cancelling could save roughly ` +
        `${formatCurrency(annualized)} per year if you no longer use it.`,
      severity:
        annualized >= 500 ? "high" : annualized >= 150 ? "medium" : "low",
      amount: annualized,
      period: "Ongoing",
      createdAt: new Date().toISOString(),
    });
  }

  // --- 2. High-frequency small purchases ------------------------------------
  const byCategory = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.category || "Uncategorized";
    const list = byCategory.get(key) || [];
    list.push(tx);
    byCategory.set(key, list);
  }

  for (const [category, list] of byCategory.entries()) {
    const small = list.filter((tx) => normalizeAmount(tx.amount) <= 25);
    if (small.length < 8) continue; // "high-frequency"
    const smallTotal = total(small);
    const avg = smallTotal / small.length;
    if (smallTotal < 50) continue;
    opportunities.push({
      id: uid(),
      userId,
      type: "opportunity",
      category,
      title: `Small ${category} purchases add up`,
      description:
        `${small.length} small ${category} purchases (avg ${formatCurrency(avg)}) ` +
        `totalled ${formatCurrency(smallTotal)}. Bundling or cutting a few could ` +
        `free up meaningful cash each month.`,
      severity:
        smallTotal >= 400 ? "high" : smallTotal >= 150 ? "medium" : "low",
      amount: smallTotal,
      period: "All time",
      createdAt: new Date().toISOString(),
    });
  }

  // --- 3. Dormant recurring categories --------------------------------------
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  for (const [category, list] of byCategory.entries()) {
    if (list.length < 4) continue;
    const recent = list.filter((tx) => {
      const d = toDate(tx.date);
      return d ? d.getTime() >= last30.getTime() : false;
    });
    if (recent.length === 0) {
      const spent = total(list);
      if (spent < 50) continue;
      opportunities.push({
        id: uid(),
        userId,
        type: "opportunity",
        category,
        title: `Dormant ${category} spending`,
        description:
          `You spent ${formatCurrency(spent)} on ${category} historically but ` +
          `nothing in the last 30 days. If this was a recurring service, ` +
          `double-check it isn't still billing you.`,
        severity: "low",
        amount: spent,
        period: "Last 30 days",
        createdAt: new Date().toISOString(),
      });
    }
  }

  return opportunities.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// 4. Category trends (week-over-week, month-over-month)
// ---------------------------------------------------------------------------

/** Compare per-category totals between two transaction sets. */
export function computeCategoryDeltas(
  current: Transaction[],
  previous: Transaction[],
): CategoryDelta[] {
  const currentTotals = new Map(
    sumByCategory(current).map((c) => [c.category, c.total]),
  );
  const previousTotals = new Map(
    sumByCategory(previous).map((c) => [c.category, c.total]),
  );

  const categories = new Set<string>([
    ...currentTotals.keys(),
    ...previousTotals.keys(),
  ]);

  const deltas: CategoryDelta[] = [];
  for (const category of categories) {
    const cur = currentTotals.get(category) || 0;
    const prev = previousTotals.get(category) || 0;
    deltas.push({
      category,
      current: cur,
      previous: prev,
      change: cur - prev,
      changePct: pctChange(cur, prev),
    });
  }

  return deltas.sort((a, b) => b.current - a.current);
}

/**
 * Build a month-by-month time series of per-category spend for the last
 * `months` months. Suitable for a Recharts multi-line chart. Also returns the
 * set of top categories so the chart only draws meaningful lines.
 */
export function calculateCategoryTrends(
  transactions: Transaction[],
  months = 6,
): { trends: TrendPoint[]; categories: string[] } {
  if (transactions.length === 0) return { trends: [], categories: [] };

  const now = new Date();
  const startWindow = startOfMonth(subMonths(now, months - 1));
  const intervalMonths = eachMonthOfInterval({
    start: startWindow,
    end: now,
  });

  // Determine top categories over the window to limit chart lines.
  const windowTx = filterByPeriod(transactions, startWindow, endOfMonth(now));
  const topCategories = sumByCategory(windowTx)
    .slice(0, 5)
    .map((c) => c.category);

  const trends: TrendPoint[] = intervalMonths.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart);
    const monthTx = filterByPeriod(transactions, monthStart, monthEnd);
    const totals = sumByCategory(monthTx);
    const totalsMap = new Map(totals.map((t) => [t.category, t.total]));

    const point: TrendPoint = {
      period: format(monthStart, "MMM yyyy"),
      timestamp: monthStart.getTime(),
      total: total(monthTx),
    };
    for (const category of topCategories) {
      point[category] = Math.round(totalsMap.get(category) || 0);
    }
    return point;
  });

  return { trends, categories: topCategories };
}

// ---------------------------------------------------------------------------
// 5. Period summaries + plain-language generation
// ---------------------------------------------------------------------------

function buildPeriodSummary(
  label: string,
  current: Transaction[],
  previous: Transaction[],
): PeriodSummary {
  const currentTotal = total(current);
  const previousTotal = total(previous);
  return {
    label,
    total: currentTotal,
    transactionCount: current.length,
    topCategories: sumByCategory(current).slice(0, 5),
    previousTotal,
    changePct: pctChange(currentTotal, previousTotal),
  };
}

/**
 * Produce a friendly, plain-language sentence describing a period summary.
 */
export function generatePlainSummary(summary: PeriodSummary): string {
  if (summary.transactionCount === 0) {
    return `No spending recorded for ${summary.label.toLowerCase()} yet. Once you add transactions, we'll break down where your money goes.`;
  }

  const top = summary.topCategories[0];
  const parts: string[] = [];
  parts.push(
    `You spent ${formatCurrency(summary.total)} across ${summary.transactionCount} transaction${
      summary.transactionCount === 1 ? "" : "s"
    } ${summary.label.toLowerCase()}.`,
  );

  if (top) {
    const share =
      summary.total > 0 ? Math.round((top.total / summary.total) * 100) : 0;
    parts.push(
      `${top.category} was your biggest category at ${formatCurrency(top.total)} (${share}% of spend).`,
    );
  }

  if (summary.changePct !== null) {
    const dir = summary.changePct >= 0 ? "up" : "down";
    parts.push(
      `That's ${dir} ${Math.abs(Math.round(summary.changePct))}% versus the previous period.`,
    );
  } else if (summary.previousTotal === 0) {
    parts.push(`This is the first period we have data to compare against.`);
  }

  return parts.join(" ");
}

/** Turn a period summary into a persistable Insight record. */
export function summaryToInsight(
  summary: PeriodSummary,
  type: "weekly" | "monthly",
  userId?: string,
): Insight {
  let severity: Severity = "low";
  if (summary.changePct !== null) {
    if (summary.changePct >= 25) severity = "high";
    else if (summary.changePct >= 10) severity = "medium";
  }
  return {
    id: uid(),
    userId,
    type,
    category: summary.topCategories[0]?.category || "Overall",
    title: `${summary.label} summary`,
    description: generatePlainSummary(summary),
    severity,
    amount: summary.total,
    period: summary.label,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 6. Orchestrator — compute the full insights bundle
// ---------------------------------------------------------------------------

/**
 * Given a user's transactions, compute all insight sections in one pass.
 */
export function buildInsights(
  transactions: Transaction[],
  userId?: string,
): InsightsBundle {
  const now = new Date();

  // Weekly windows (week starts Monday).
  const weekOpts = { weekStartsOn: 1 as const };
  const thisWeekStart = startOfWeek(now, weekOpts);
  const thisWeekEnd = endOfWeek(now, weekOpts);
  const lastWeekStart = startOfWeek(subWeeks(now, 1), weekOpts);
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), weekOpts);

  const thisWeek = filterByPeriod(transactions, thisWeekStart, thisWeekEnd);
  const lastWeek = filterByPeriod(transactions, lastWeekStart, lastWeekEnd);

  // Monthly windows.
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const thisMonth = filterByPeriod(transactions, thisMonthStart, thisMonthEnd);
  const lastMonth = filterByPeriod(transactions, lastMonthStart, lastMonthEnd);

  const weeklySummary = buildPeriodSummary("This Week", thisWeek, lastWeek);
  const monthlySummary = buildPeriodSummary("This Month", thisMonth, lastMonth);

  const { trends, categories } = calculateCategoryTrends(transactions, 6);

  return {
    weekly: computeCategoryDeltas(thisWeek, lastWeek),
    weeklySummary,
    monthlySummary,
    monthlyDeltas: computeCategoryDeltas(thisMonth, lastMonth),
    anomalies: detectAnomalies(transactions, userId),
    opportunities: identifyOpportunities(transactions, userId),
    trends,
    trendCategories: categories,
    transactionCount: transactions.length,
  };
}

/** Convenience: fetch + compute in one call. */
export async function loadInsights(userId: string): Promise<InsightsBundle> {
  const transactions = await fetchTransactions(userId);
  return buildInsights(transactions, userId);
}
