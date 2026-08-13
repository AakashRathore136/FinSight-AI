/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import {

  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeTransactionType } from "./utils";
import {
  subDays,
  addMonths,
  addYears,
  addWeeks,
  addDays,
  startOfDay,
  differenceInDays,
  isBefore,
  isAfter,
} from "date-fns";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: "income" | "expense";
}

export type SubscriptionFrequency =
  | "weekly"
  | "bi-weekly"
  | "monthly"
  | "quarterly"
  | "semi-annual"
  | "yearly";

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  amount: number;
  frequency: SubscriptionFrequency;
  category: string;
  nextRenewalDate: Date;
  isActive: boolean;
  detectedFromTransactionId?: string;
  createdAt: Date;
  /** Charges per year derived from the observed interval at detection time.
   * Used by the cost summary so weekly/bi-weekly cadences are not annualized
   * with a hardcoded multiplier. (Issue #1032) */
  annualizationFactor?: number;
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalYearly: number;
  activeCount: number;
  categoryGroups: Record<
    string,
    { count: number; monthly: number; yearly: number }
  >;
  upcomingRenewals: Subscription[];
  subscriptionBurden: number;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function isLikelySubscription(description: string): boolean {
  const normalized = description.toLowerCase();
  const keywords = [
    "netflix",
    "spotify",
    "amazon prime",
    "hulu",
    "disney+",
    "apple music",
    "youtube premium",
    "hbo max",
    "peacock",
    "paramount+",
    "crunchyroll",
    "adobe",
    "microsoft 365",
    "office 365",
    "google one",
    "icloud",
    "github",
    "figma",
    "notion",
    "slack",
    "zoom",
    "dropbox",
    "box",
    "subscription",
    "recurring",
    "monthly",
    "annual",
    "plan",
    "membership",
    "service",
    "cloud",
    "saas",
    "pro",
    "plus",
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

function getNormalizedAmounts(transactions: Transaction[]): number[] {
  const amounts = transactions.map((t) => t.amount);
  const unique = [...new Set(amounts.map((a) => a.toFixed(2)))];
  return unique.map(Number);
}

export async function fetchUserTransactions(
  userId: string,
  daysBack: number = 365,
): Promise<Transaction[]> {
  try {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      where("date", ">=", Timestamp.fromDate(subDays(new Date(), daysBack))),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || "",
        amount: data.amount || 0,
        category: data.category || "Other",
        description: data.description || "",
        date: toDate(data.date) || new Date(),
        type: normalizeTransactionType(data.type),
      } as Transaction;
    });
  } catch (error) {
    // Fallback to ownerId for backward compatibility
    try {
      const q = query(
        collection(db, "transactions"),
        where("ownerId", "==", userId),
        where("date", ">=", Timestamp.fromDate(subDays(new Date(), daysBack))),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || data.ownerId || "",
          ownerId: data.ownerId || "",
          amount: data.amount || 0,
          category: data.category || "Other",
          description: data.description || "",
          date: toDate(data.date) || new Date(),
          type: data.type || "expense",
        } as Transaction;
      });
    } catch (fallbackError) {
      console.error("Error fetching transactions:", fallbackError);
      return [];
    }
  }
}

export function groupTransactionsIntoSubscriptions(
  transactions: Transaction[],
): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    if (!isLikelySubscription(transaction.description)) continue;
    const normalized = normalizeText(transaction.description);
    // Empty/punctuation-only/emoji-only/foreign descriptions normalize to ""
    // and would match every group via `key.includes("")`. Exclude them from
    // auto-detection instead of folding them into an unrelated merchant.
    if (!normalized) continue;
    const category = transaction.category.toLowerCase();

    let matchedKey: string | null = null;

    for (const [key, group] of groups) {
      if (normalized.includes(key) || key.includes(normalized)) {
        matchedKey = key;
        break;
      }
      const groupCategory = group[0]?.category?.toLowerCase() || "";
      const groupAmounts = getNormalizedAmounts(group);
      const amountMatch = groupAmounts.some(
        (amt) =>
          Math.abs(amt - transaction.amount) <
          0.01 * Math.max(1, Math.abs(amt)),
      );
      if (amountMatch && category === groupCategory) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) {
      // Use the full normalized description as the group key: truncating to
      // 20 chars merges distinct subscriptions that share a prefix (e.g.
      // "adobe creative cloud photography plan" vs "... all-apps annual").
      groups.set(normalized, [transaction]);
    } else {
      const existing = groups.get(matchedKey)!;
      existing.push(transaction);
    }
  }

  return groups;
}

export function analyzeSubscriptionPattern(
  transactions: Transaction[],
): {
  frequency: SubscriptionFrequency;
  confidence: number;
  /** Observed average interval between charges, in days. Cost annualization is
   * derived from this so it reflects the actual cadence (e.g. bi-weekly at
   * ~14 days) instead of assuming a fixed 52x/12x. (Issue #1032) */
  avgIntervalDays: number;
} | null {
  if (transactions.length < 2) return null;

  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const intervals: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    intervals.push(differenceInDays(sorted[i].date, sorted[i - 1].date));
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) /
    intervals.length;
  const stdDev = Math.sqrt(variance);
  const consistency = stdDev < avgInterval * 0.3 ? 1 : 0.5;

  if (avgInterval >= 5 && avgInterval <= 10) {
    return { frequency: "weekly", confidence: consistency, avgIntervalDays: avgInterval };
  } else if (avgInterval > 10 && avgInterval <= 18) {
    return { frequency: "bi-weekly", confidence: consistency, avgIntervalDays: avgInterval };
  } else if (avgInterval >= 25 && avgInterval <= 35) {
    return { frequency: "monthly", confidence: consistency, avgIntervalDays: avgInterval };
  } else if (avgInterval >= 80 && avgInterval <= 100) {
    return { frequency: "quarterly", confidence: consistency, avgIntervalDays: avgInterval };
  } else if (avgInterval >= 170 && avgInterval <= 190) {
    return { frequency: "semi-annual", confidence: consistency, avgIntervalDays: avgInterval };
  } else if (avgInterval >= 350 && avgInterval <= 380) {
    return { frequency: "yearly", confidence: consistency, avgIntervalDays: avgInterval };
  }

  return { frequency: "monthly", confidence: 0.3, avgIntervalDays: avgInterval };
}

/** Default annualization factor (charges per year) per declared frequency.
 * Only used as a fallback when a subscription has no stored annualizationFactor;
 * detected subscriptions always store the observed-interval factor instead. */
function defaultAnnualizationFactor(
  frequency: SubscriptionFrequency,
): number {
  switch (frequency) {
    case "weekly":
      return 52;
    case "bi-weekly":
      return 26;
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semi-annual":
      return 2;
    case "yearly":
      return 1;
  }
}

/** Annualization factor (charges per year) for a subscription, preferring the
 * factor captured at detection time from the actual observed interval between
 * charges. (Issue #1032) */
export function getAnnualizationFactor(sub: Subscription): number {
  if (
    typeof sub.annualizationFactor === "number" &&
    Number.isFinite(sub.annualizationFactor) &&
    sub.annualizationFactor > 0
  ) {
    return sub.annualizationFactor;
  }
  return defaultAnnualizationFactor(sub.frequency);
}

function advanceByFrequency(
  date: Date,
  frequency: SubscriptionFrequency,
  originalDay?: number,
): Date {
  switch (frequency) {
    case "weekly":
      return addWeeks(date, 1);
    case "bi-weekly":
      return addWeeks(date, 2);
    case "yearly":
      return addYears(date, 1);
    case "quarterly": {
      const day = originalDay ?? date.getDate();
      const next = addMonths(date, 3);
      const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDayOfNextMonth));
      return next;
    }
    case "semi-annual": {
      const day = originalDay ?? date.getDate();
      const next = addMonths(date, 6);
      const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDayOfNextMonth));
      return next;
    }
    case "monthly":
    default: {
      const day = originalDay ?? date.getDate();
      const next = addMonths(date, 1);
      const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDayOfNextMonth));
      return next;
    }
  }
}

export function predictNextRenewalDate(
  transactions: Transaction[],
  frequency: SubscriptionFrequency,
): Date {
  const sorted = [...transactions].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
  const lastDate = sorted[0]?.date || new Date();
  const now = new Date();

  // Advance forward from the last observed charge to the first future
  // occurrence. A stale last charge (paused service, missed payment, long
  // gap) must not produce a past renewal date that hides the subscription
  // from upcoming-renewals and reminders.
  const originalDay = lastDate.getDate();
  let next = startOfDay(lastDate);
  do {
    next = advanceByFrequency(next, frequency, originalDay);
  } while (isBefore(next, now));

  return next;
}

export function calculateSubscriptionCosts(subscriptions: Subscription[]): {
  monthly: number;
  yearly: number;
} {
  let monthly = 0;
  let yearly = 0;

  for (const sub of subscriptions) {
    if (!sub.isActive) continue;
    // Annualize using the actual detected cadence (observed interval between
    // charges) rather than a fixed 52x/12x assumption. Monthly is derived from
    // the annualized figure so the two stay consistent. (Issue #1032)
    const factor = getAnnualizationFactor(sub);
    const annual = sub.amount * factor;
    yearly += annual;
    monthly += annual / 12;
  }

  return {
    monthly: Math.round(monthly * 100) / 100,
    yearly: Math.round(yearly * 100) / 100,
  };
}

export function calculateCategoryGroups(
  subscriptions: Subscription[],
): Record<string, { count: number; monthly: number; yearly: number }> {
  const groups: Record<
    string,
    { count: number; monthly: number; yearly: number }
  > = {};

  for (const sub of subscriptions) {
    if (!sub.isActive) continue;
    const category = sub.category || "Uncategorized";
    if (!groups[category]) {
      groups[category] = { count: 0, monthly: 0, yearly: 0 };
    }

    groups[category].count += 1;
    // Annualize using the actual detected cadence (observed interval between
    // charges) rather than a fixed 52x/12x assumption. (Issue #1032)
    const factor = getAnnualizationFactor(sub);
    const annual = sub.amount * factor;
    groups[category].yearly += annual;
    groups[category].monthly += annual / 12;
  }

  for (const key in groups) {
    groups[key].monthly = Math.round(groups[key].monthly * 100) / 100;
    groups[key].yearly = Math.round(groups[key].yearly * 100) / 100;
  }

  return groups;
}

export function getUpcomingRenewals(
  subscriptions: Subscription[],
  days: number = 30,
): Subscription[] {
  const now = new Date();
  const cutoff = addDays(now, days);

  return subscriptions
    .filter(
      (sub) =>
        sub.isActive &&
        isAfter(sub.nextRenewalDate, now) &&
        !isAfter(sub.nextRenewalDate, cutoff),
    )
    .sort((a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime());
}

export function estimateMonthlyIncome(
  transactions: Transaction[],
  windowMonths: number = 6,
): number {
  const incomeByMonth = new Map<string, number>();
  let minKey: { year: number; month: number } | null = null;
  let maxKey: { year: number; month: number } | null = null;
  transactions.forEach((t) => {
    if (t.type !== "income") return;
    const year = t.date.getFullYear();
    const month = t.date.getMonth();
    const key = `${year}-${month}`;
    incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + t.amount);
    if (!minKey || year < minKey.year || (year === minKey.year && month < minKey.month)) {
      minKey = { year, month };
    }
    if (!maxKey || year > maxKey.year || (year === maxKey.year && month > maxKey.month)) {
      maxKey = { year, month };
    }
  });
  const monthCount = incomeByMonth.size;
  if (monthCount === 0) return 0;
  const total = Array.from(incomeByMonth.values()).reduce((a, b) => a + b, 0);
  const span =
    minKey && maxKey
      ? (maxKey.year - minKey.year) * 12 + (maxKey.month - minKey.month) + 1
      : monthCount;
  return total / Math.max(1, Math.min(span, windowMonths));
}

export function calculateSubscriptionBurden(
  monthlyCost: number,
  estimatedMonthlyIncome?: number,
): number {
  if (!estimatedMonthlyIncome || estimatedMonthlyIncome <= 0) {
    return 0;
  }
  return Math.round((monthlyCost / estimatedMonthlyIncome) * 100);
}

export function generateSubscriptionSummary(
  subscriptions: Subscription[],
  estimatedMonthlyIncome?: number,
): SubscriptionSummary {
  const costs = calculateSubscriptionCosts(subscriptions);
  const upcoming = getUpcomingRenewals(subscriptions, 30);
  const categories = calculateCategoryGroups(subscriptions);
  const activeCount = subscriptions.filter((s) => s.isActive).length;
  const burden = calculateSubscriptionBurden(
    costs.monthly,
    estimatedMonthlyIncome,
  );

  return {
    totalMonthly: costs.monthly,
    totalYearly: costs.yearly,
    activeCount,
    categoryGroups: categories,
    upcomingRenewals: upcoming,
    subscriptionBurden: burden,
  };
}

export async function saveSubscription(
  userId: string,
  subscription: Omit<Subscription, "id" | "userId" | "createdAt">,
): Promise<string> {
  const id = doc(collection(db, "subscriptions")).id;
  const docRef = doc(db, "subscriptions", id);
  await setDoc(docRef, {
    ...subscription,
    userId,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateSubscription(
  id: string,
  data: Partial<Omit<Subscription, "id" | "userId" | "createdAt">>,
): Promise<void> {
  const docRef = doc(db, "subscriptions", id);
  await updateDoc(docRef, data as any);
}

export async function deleteSubscription(id: string): Promise<void> {
  const docRef = doc(db, "subscriptions", id);
  await deleteDoc(docRef);
}

export async function fetchUserSubscriptions(
  userId: string,
): Promise<Subscription[]> {
  try {
    const q = query(
      collection(db, "subscriptions"),
      where("userId", "==", userId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        name: data.name,
        amount: data.amount,
        frequency: data.frequency,
        category: data.category || "Other",
        nextRenewalDate: toDate(data.nextRenewalDate) || new Date(),
        isActive: data.isActive ?? true,
        detectedFromTransactionId: data.detectedFromTransactionId,
        createdAt: toDate(data.createdAt) || new Date(),
        annualizationFactor: data.annualizationFactor,
      } as Subscription;
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return [];
  }
}

export async function detectAndSaveSubscriptions(
  userId: string,
  transactions: Transaction[],
): Promise<Subscription[]> {
  const groups = groupTransactionsIntoSubscriptions(transactions);
  const existingSubs = await fetchUserSubscriptions(userId);
  const existingNames = new Set(existingSubs.map((s) => s.name.toLowerCase()));
  const createdSubs: Subscription[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < 2) continue;
    const analysis = analyzeSubscriptionPattern(txns);
    if (!analysis || analysis.confidence < 0.4) continue;

    const name = txns[0].description || key;

    if (existingNames.has(name.toLowerCase())) continue;

    const nextRenewal = predictNextRenewalDate(txns, analysis.frequency);
    // Charges per year from the observed interval (e.g. ~52 for weekly, ~26
    // for bi-weekly, ~12 for monthly). Falls back to the frequency default
    // when absent. (Issue #1032)
    const annualizationFactor =
      analysis.avgIntervalDays > 0 ? 365.25 / analysis.avgIntervalDays : undefined;

    try {
      const id = await saveSubscription(userId, {
        name: name,
        amount: txns[0].amount,
        frequency: analysis.frequency,
        category: txns[0].category || "Other",
        nextRenewalDate: nextRenewal,
        isActive: true,
        detectedFromTransactionId: txns[0].id,
        annualizationFactor,
      });

      createdSubs.push({
        id,
        userId,
        name: name,
        amount: txns[0].amount,
        frequency: analysis.frequency,
        category: txns[0].category || "Other",
        nextRenewalDate: nextRenewal,
        isActive: true,
        detectedFromTransactionId: txns[0].id,
        createdAt: new Date(),
        annualizationFactor,
      });
    } catch (error) {
      console.error("Error saving subscription:", error);
    }
  }

  return createdSubs;
}
