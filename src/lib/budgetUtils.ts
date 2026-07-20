import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  type: "income" | "expense";
  date: Date;
  description?: string;
}

export interface CategoryBudgetSuggestion {
  category: string;
  suggestedAmount: number;
  averageSpending: number;
  previousMonthSpending: number;
  status: "accepted" | "rejected" | "modified";
  modifiedAmount?: number;
}

export interface BudgetData {
  userId: string;
  month: string;
  totalBudget: number;
  categoryBudgets: Record<string, number>;
  confidenceScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetComparison {
  category: string;
  suggested: number;
  previous: number;
  difference: number;
  percentChange: number;
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getPreviousMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function fetchLast3MonthsTransactions(
  userId: string,
): Promise<Transaction[]> {
  if (!userId) return [];

  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const transactionsRef = collection(db, "transactions");
    const q = query(
      transactionsRef,
      where("userId", "==", userId),
      where("date", ">=", Timestamp.fromDate(threeMonthsAgo)),
      orderBy("date", "desc"),
    );

    const snapshot = await getDocs(q);
    const transactions: Transaction[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      let date: Date;
      if (data.date instanceof Timestamp) {
        date = data.date.toDate();
      } else if (data.date instanceof Date) {
        date = data.date;
      } else if (
        typeof data.date === "string" ||
        typeof data.date === "number"
      ) {
        date = new Date(data.date);
      } else {
        date = new Date();
      }

      return {
        id: doc.id,
        userId: data.userId || "",
        amount: Number(data.amount) || 0,
        category: data.category || "Other",
        type: data.type === "income" ? "income" : "expense",
        date,
        description: data.description,
      };
    });

    return transactions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export async function fetchPreviousMonthTransactions(
  userId: string,
): Promise<Transaction[]> {
  if (!userId) return [];

  try {
    const now = new Date();
    const prevMonthStart = getStartOfMonth(getPreviousMonth(now));
    const prevMonthEnd = getEndOfMonth(getPreviousMonth(now));

    const transactionsRef = collection(db, "transactions");
    const q = query(
      transactionsRef,
      where("userId", "==", userId),
      where("date", ">=", Timestamp.fromDate(prevMonthStart)),
      where("date", "<=", Timestamp.fromDate(prevMonthEnd)),
      orderBy("date", "desc"),
    );

    const snapshot = await getDocs(q);
    const transactions: Transaction[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      let date: Date;
      if (data.date instanceof Timestamp) {
        date = data.date.toDate();
      } else if (data.date instanceof Date) {
        date = data.date;
      } else if (
        typeof data.date === "string" ||
        typeof data.date === "number"
      ) {
        date = new Date(data.date);
      } else {
        date = new Date();
      }

      return {
        id: doc.id,
        userId: data.userId || "",
        amount: Number(data.amount) || 0,
        category: data.category || "Other",
        type: data.type === "income" ? "income" : "expense",
        date,
        description: data.description,
      };
    });

    return transactions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export function calculateAverageSpending(
  transactions: Transaction[],
): Record<string, number> {
  const categoryTotals: Record<string, number> = {};
  const categoryMonths: Record<string, Set<string>> = {};

  const expenseTransactions = transactions.filter((t) => t.type === "expense");

  expenseTransactions.forEach((t) => {
    const monthKey = formatMonthKey(t.date);
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    if (!categoryMonths[t.category]) {
      categoryMonths[t.category] = new Set();
    }
    categoryMonths[t.category].add(monthKey);
  });

  const averages: Record<string, number> = {};
  Object.keys(categoryTotals).forEach((category) => {
    const months = categoryMonths[category]?.size || 1;
    averages[category] = categoryTotals[category] / Math.max(months, 1);
  });

  return averages;
}

export function calculateCategorySpending(
  transactions: Transaction[],
): Record<string, number> {
  const categoryTotals: Record<string, number> = {};

  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

  return categoryTotals;
}

export function calculateConfidenceScore(
  transactions: Transaction[],
  averages: Record<string, number>,
): number {
  if (transactions.length === 0) return 0;

  const expenseTransactions = transactions.filter((t) => t.type === "expense");
  if (expenseTransactions.length === 0) return 0;

  const categories = Object.keys(averages);
  if (categories.length === 0) return 0;

  const monthsWithData = new Set(
    expenseTransactions.map((t) => formatMonthKey(t.date)),
  ).size;

  const dataConsistencyScore = Math.min(monthsWithData / 3, 1) * 40;

  const transactionCountScore =
    Math.min(expenseTransactions.length / 30, 1) * 35;

  const categoryDiversityScore = Math.min(categories.length / 8, 1) * 25;

  const totalScore = Math.round(
    dataConsistencyScore + transactionCountScore + categoryDiversityScore,
  );

  return Math.min(totalScore, 100);
}

export function generateBudgetSuggestions(
  transactions: Transaction[],
  previousMonthSpending: Record<string, number>,
): CategoryBudgetSuggestion[] {
  const averages = calculateAverageSpending(transactions);

  const suggestions: CategoryBudgetSuggestion[] = Object.entries(averages).map(
    ([category, avgSpending]) => {
      const prevSpending = previousMonthSpending[category] || avgSpending;

      const trend =
        prevSpending > 0 ? (avgSpending - prevSpending) / prevSpending : 0;

      let suggestedAmount = avgSpending;
      if (trend > 0.2) {
        suggestedAmount = avgSpending * 0.9;
      } else if (trend < -0.2) {
        suggestedAmount = avgSpending * 1.1;
      }

      suggestedAmount = Math.round(suggestedAmount * 100) / 100;

      return {
        category,
        suggestedAmount,
        averageSpending: Math.round(avgSpending * 100) / 100,
        previousMonthSpending: Math.round(prevSpending * 100) / 100,
        status: "accepted",
      };
    },
  );

  return suggestions.sort((a, b) => b.suggestedAmount - a.suggestedAmount);
}

export function calculateTotalBudget(
  suggestions: CategoryBudgetSuggestion[],
): number {
  return suggestions.reduce((total, s) => {
    const amount =
      s.status === "rejected" ? 0 : (s.modifiedAmount ?? s.suggestedAmount);
    return total + amount;
  }, 0);
}

export async function saveBudgetToFirestore(budget: BudgetData): Promise<void> {
  if (!budget.userId) return;

  try {
    const { doc, setDoc } = await import("firebase/firestore");
    const budgetRef = doc(db, "budgets", `${budget.userId}_${budget.month}`);
    await setDoc(
      budgetRef,
      {
        ...budget,
        createdAt: budget.createdAt || new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.BUDGET, "budgets");
    throw error;
  }
}

export async function fetchBudgetFromFirestore(
  userId: string,
  month: string,
): Promise<BudgetData | null> {
  if (!userId || !month) return null;

  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const budgetRef = doc(db, "budgets", `${userId}_${month}`);
    const snapshot = await getDoc(budgetRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
      userId: data.userId,
      month: data.month,
      totalBudget: Number(data.totalBudget) || 0,
      categoryBudgets: data.categoryBudgets || {},
      confidenceScore: Number(data.confidenceScore) || 0,
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, "budgets");
    return null;
  }
}

export function generateBudgetComparison(
  suggestions: CategoryBudgetSuggestion[],
  previousMonthSpending: Record<string, number>,
): BudgetComparison[] {
  return suggestions
    .map((s) => {
      const suggested =
        s.status === "rejected" ? 0 : (s.modifiedAmount ?? s.suggestedAmount);
      const previous = previousMonthSpending[s.category] || s.averageSpending;
      const difference = suggested - previous;
      const percentChange =
        previous > 0 ? Math.round((difference / previous) * 100) : 0;

      return {
        category: s.category,
        suggested,
        previous: Math.round(previous * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        percentChange,
      };
    })
    .sort((a, b) => b.difference - a.difference);
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return formatMonthKey(now);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
