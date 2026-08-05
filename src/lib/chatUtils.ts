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
  orderBy,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatCurrency, normalizeTransactionType } from '@/src/lib/utils';
import type { Transaction } from '@/src/lib/trendsUtils';

export interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface FinancialContext {
  transactions: Transaction[];
  budgetCategories: { name: string; monthlyLimit: number }[];
  totalSpending: number;
  totalIncome: number;
  monthlySpending: Record<string, number>;
  categorySpending: Record<string, number>;
  spendingByMonth: { month: string; amount: number }[];
  topCategories: { name: string; amount: number; percentage: number }[];
  savingsRate: number;
  budgetUtilization: number;
}

export interface ChatResponse {
  message: string;
  chartData?: any[];
  suggestions?: string[];
}

const CHAT_COLLECTION = 'chat_conversations';
const MESSAGE_COLLECTION = 'chat_messages';

export async function saveConversation(conversation: Omit<Conversation, 'id'>): Promise<Conversation | null> {
  try {
    const id = doc(collection(db, CHAT_COLLECTION)).id;
    const now = new Date().toISOString();
    const data = {
      ...conversation,
      id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    };
    await setDoc(doc(db, CHAT_COLLECTION, id), data);
    return { ...data, id, createdAt: now, updatedAt: now, lastMessageAt: now };
  } catch (error) {
    console.error('Error saving conversation:', error);
    handleFirestoreError(error, OperationType.CREATE, CHAT_COLLECTION);
    return null;
  }
}


export async function updateConversation(conversationId: string, patch: Partial<Conversation>): Promise<boolean> {
  try {
    await updateDoc(doc(db, CHAT_COLLECTION, conversationId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating conversation:', error);
    handleFirestoreError(error, OperationType.UPDATE, `${CHAT_COLLECTION}/${conversationId}`);
    return false;
  }
}

export async function loadConversations(userId: string): Promise<Conversation[]> {
  try {
    const ref = collection(db, CHAT_COLLECTION);
    const q = query(ref, where('userId', '==', userId), orderBy('lastMessageAt', 'desc'));
    const snapshot = await getDocs(q);
    const conversations: Conversation[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const toIso = (val: any) =>
        val && typeof val.toDate === 'function' ? val.toDate().toISOString() : (val || new Date().toISOString());
      conversations.push({
        id: docSnap.id,
        userId: data.userId || '',
        title: data.title || 'New Conversation',
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        lastMessageAt: toIso(data.lastMessageAt),
      });
    });
    return conversations;
  } catch (error) {
    console.error('Error loading conversations:', error);
    handleFirestoreError(error, OperationType.LIST, CHAT_COLLECTION);
    return [];
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, CHAT_COLLECTION, conversationId));
    return true;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    handleFirestoreError(error, OperationType.DELETE, `${CHAT_COLLECTION}/${conversationId}`);
    return false;
  }
}

export async function saveMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage | null> {
  try {
    const id = doc(collection(db, MESSAGE_COLLECTION)).id;
    const now = new Date().toISOString();
    const data = {
      ...message,
      id,
      timestamp: serverTimestamp(),
    };
    await setDoc(doc(db, MESSAGE_COLLECTION, id), data);
    return { ...data, id, timestamp: now };
  } catch (error) {
    console.error('Error saving message:', error);
    handleFirestoreError(error, OperationType.CREATE, MESSAGE_COLLECTION);
    return null;
  }
}

export async function loadMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  try {
    const ref = collection(db, MESSAGE_COLLECTION);
    const q = query(
      ref,
      where('conversationId', '==', conversationId),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc')
    );
    const snapshot = await getDocs(q);
    const messages: ChatMessage[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      messages.push({
        id: docSnap.id,
        conversationId: data.conversationId || '',
        userId: data.userId || '',
        role: data.role || 'user',
        content: data.content || '',
        timestamp: (() => {
          const t = data.timestamp;
          return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : (t || new Date().toISOString());
        })(),
        metadata: data.metadata,
      });
    });
    return messages;
  } catch (error) {
    console.error('Error loading messages:', error);
    handleFirestoreError(error, OperationType.LIST, MESSAGE_COLLECTION);
    return [];
  }
}

export function buildFinancialContext(
  userId: string,
  transactions: Transaction[],
  budgetCategories: { name: string; monthlyLimit: number }[]
): FinancialContext {
  const expenses = transactions.filter(
    (t) => normalizeTransactionType(t.type) === 'expense',
  );
  const income = transactions.filter(
    (t) => normalizeTransactionType(t.type) === 'income',
  );

  const totalSpending = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);

  const monthlySpending: Record<string, number> = {};
  expenses.forEach((t) => {
    const monthKey = format(t.date, 'yyyy-MM');
    monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + t.amount;
  });

  const categorySpending: Record<string, number> = {};
  expenses.forEach((t) => {
    categorySpending[t.category] = (categorySpending[t.category] || 0) + t.amount;
  });

  const spendingByMonth = Object.entries(monthlySpending)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  const topCategories = Object.entries(categorySpending)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalSpending) / totalIncome) * 100) : 0;

  const monthlyBudget = budgetCategories.reduce((sum, c) => sum + c.monthlyLimit, 0);
  const budgetUtilization = monthlyBudget > 0 ? Math.round((totalSpending / monthlyBudget) * 100) : 0;

  return {
    transactions,
    budgetCategories,
    totalSpending,
    totalIncome,
    monthlySpending,
    categorySpending,
    spendingByMonth,
    topCategories,
    savingsRate,
    budgetUtilization,
  };
}

export function generateChatResponse(
  userMessage: string,
  context: FinancialContext
): ChatResponse {
  const lowerMessage = userMessage.toLowerCase();
  let response = '';
  let chartData: any[] | undefined;
  let suggestions: string[] = [];

  if (lowerMessage.includes('expense') || lowerMessage.includes('spending') || lowerMessage.includes('spent')) {
    const result = generateSpendingSummary(context);
    response = result.message;
    chartData = result.chartData;
  } else if (lowerMessage.includes('budget') || lowerMessage.includes('advice')) {
    const result = generateBudgetAdvice(context);
    response = result.message;
  } else if (lowerMessage.includes('category') || lowerMessage.includes('categories')) {
    const result = generateCategoryInsights(context);
    response = result.message;
    chartData = result.chartData;
    suggestions = result.suggestions;
  } else if (lowerMessage.includes('saving') || lowerMessage.includes('savings')) {
    const result = generateSavingsRecommendations(context);
    response = result.message;
  } else if (lowerMessage.includes('pattern') || lowerMessage.includes('trend')) {
    const result = analyzeSpendingPatterns(context);
    response = result.message;
    chartData = result.chartData;
  } else {
    response = generateDefaultResponse(context).message;
    suggestions = ['Show me my spending summary', 'Give me budget advice', 'Analyze my spending patterns', 'Category insights'];
  }

  return { message: response, chartData, suggestions };
}

export function generateSpendingSummary(context: FinancialContext): ChatResponse {
  const { totalSpending, totalIncome, monthlySpending, spendingByMonth, topCategories } = context;
  const currentMonth = format(new Date(), 'yyyy-MM');
  const currentMonthSpending = monthlySpending[currentMonth] || 0;
  const avgMonthly = spendingByMonth.length > 0
    ? Math.round(spendingByMonth.reduce((sum, m) => sum + m.amount, 0) / spendingByMonth.length)
    : 0;

  let response = `Your total spending is ${formatCurrency(totalSpending)}. `;
  response += `This month you've spent ${formatCurrency(currentMonthSpending)}. `;

  if (avgMonthly > 0) {
    const diff = currentMonthSpending - avgMonthly;
    const trend = diff > 0 ? 'higher' : 'lower';
    response += `This is ${formatCurrency(Math.abs(diff))} ${trend} than your average of ${formatCurrency(avgMonthly)}. `;
  }

  if (topCategories.length > 0) {
    response += `Your top spending categories are ${topCategories.slice(0, 3).map(c => `${c.name} (${formatCurrency(c.amount)})`).join(', ')}.`;
  }

  return {
    message: response,
    chartData: spendingByMonth,
  };
}

export function generateBudgetAdvice(context: FinancialContext): ChatResponse {
  const { totalSpending, totalIncome, savingsRate, budgetUtilization, topCategories, budgetCategories } = context;
  const monthlyBudget = budgetCategories.reduce((sum, c) => sum + c.monthlyLimit, 0);
  let response = '';

  if (monthlyBudget <= 0) {
    response = 'You don\'t have any budget categories set up yet. Consider creating budget categories to better track your spending.';
  } else if (budgetUtilization > 100) {
    response = `You're over budget by ${formatCurrency(totalSpending - monthlyBudget)}. Consider reducing spending in ${topCategories[0]?.name || 'your top category'} and reviewing your budget allocations.`;
  } else if (budgetUtilization > 80) {
    response = `You're approaching your budget limit at ${budgetUtilization}% utilization. Monitor your spending closely and consider cutting back on discretionary expenses.`;
  } else {
    response = `You're at ${budgetUtilization}% budget utilization. Good job staying within budget! Your savings rate is ${savingsRate}%.`;
  }

  if (topCategories.length > 0) {
    response += ` Consider setting a limit for ${topCategories[0].name} to improve savings.`;
  }

  return { message: response };
}

export function analyzeSpendingPatterns(context: FinancialContext): ChatResponse {
  const { monthlySpending, spendingByMonth } = context;
  const months = Object.keys(monthlySpending).sort((a, b) => a - b);
  let response = '';

  if (months.length < 2) {
    response = 'I need more transaction data to identify spending patterns. Add more transactions to get better insights.';
    return { message: response };
  }

  const increases: { month: string; amount: number }[] = [];
  for (let i = 1; i < spendingByMonth.length; i++) {
    const diff = spendingByMonth[i].amount - spendingByMonth[i - 1].amount;
    if (diff > 0) {
      increases.push({ month: spendingByMonth[i].month, amount: diff });
    }
  }

  if (increases.length > 0) {
    const maxIncrease = increases.reduce((max, curr) => curr.amount > max.amount ? curr : max, increases[0]);
    response += `Spending increased by ${formatCurrency(maxIncrease.amount)} in ${maxIncrease.month}. `;
  }

  const avg = spendingByMonth.reduce((sum, m) => sum + m.amount, 0) / spendingByMonth.length;
  response += `Your average monthly spending is ${formatCurrency(Math.round(avg))}.`;

  return {
    message: response,
    chartData: spendingByMonth,
  };
}

export function generateCategoryInsights(context: FinancialContext): ChatResponse {
  const { topCategories, categorySpending, totalSpending } = context;
  let response = '';
  const suggestions: string[] = [];

  if (topCategories.length === 0) {
    response = 'No category data available yet. Start categorizing your transactions for insights.';
    return { message: response, suggestions };
  }

  response += `Your top spending category is ${topCategories[0].name} at ${formatCurrency(topCategories[0].amount)} (${topCategories[0].percentage}% of total). `;

  if (topCategories.length > 1) {
    const second = topCategories[1];
    response += `Second highest is ${second.name} at ${formatCurrency(second.amount)} (${second.percentage}%). `;
  }

  if (topCategories[0]?.percentage && topCategories[0].percentage > 40) {
    response += `Consider reducing spending in ${topCategories[0].name} as it's over 40% of your total.`;
    suggestions.push(`Set a budget limit for ${topCategories[0].name}`);
    suggestions.push('Review recurring subscriptions in this category');
  }

  suggestions.push('Switch to a lower-cost provider');
  suggestions.push('Set weekly spending limits');

  return {
    message: response,
    chartData: topCategories,
    suggestions,
  };
}

export function generateSavingsRecommendations(context: FinancialContext): ChatResponse {
  const { totalSpending, totalIncome, savingsRate, topCategories, monthlySpending } = context;
  let response = '';

  if (totalIncome <= 0) {
    response = 'I need income data to provide savings recommendations. Please add your income sources.';
    return { message: response };
  }

  const potentialSavings = topCategories.reduce((sum, c) => sum + c.amount * 0.1, 0);
  const newSavingsRate = savingsRate + Math.round((potentialSavings / totalIncome) * 100);

  response += `Your current savings rate is ${savingsRate}%. `;

  if (savingsRate < 20) {
    response += `Aim to save at least 20% of your income. `;
  }

  response += `By reducing top category spending by 10%, you could save ${formatCurrency(Math.round(potentialSavings))} per month. `;

  if (topCategories.length > 0) {
    response += `Focus on ${topCategories[0].name} for maximum impact.`;
  }

  return { message: response };
}

function generateDefaultResponse(context: FinancialContext): ChatResponse {
  const { totalSpending, savingsRate } = context;
  let response = `I can help you with your finances. You've spent ${formatCurrency(totalSpending)} total. `;
  response += `Your savings rate is ${savingsRate}%. Ask me about expenses, budget advice, spending patterns, category insights, or savings recommendations.`;
  return { message: response };
}
