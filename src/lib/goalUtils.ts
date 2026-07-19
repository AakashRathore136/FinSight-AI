import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';

export interface Goal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  category: string;
  suggestedMonthlyContribution: number;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  completedAt?: string;
}

export function calculateMonthlyContribution(targetAmount: number, deadline: Date): number {
  const now = new Date();
  const monthsRemaining = Math.max(1, (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth()));
  return Math.round(targetAmount / monthsRemaining);
}

export function calculateDaysRemaining(deadline: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(deadline);
  end.setHours(0, 0, 0, 0);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function checkGoalCompletion(goal: Goal): boolean {
  return goal.currentAmount >= goal.targetAmount;
}

export async function fetchUserGoals(userId: string): Promise<Goal[]> {
  if (!userId) return [];
  try {
    const goalsRef = collection(db, 'goals');
    const q = query(goalsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        name: data.name,
        targetAmount: Number(data.targetAmount) || 0,
        currentAmount: Number(data.currentAmount) || 0,
        deadline: data.deadline,
        category: data.category,
        suggestedMonthlyContribution: Number(data.suggestedMonthlyContribution) || 0,
        status: data.status || 'active',
        createdAt: data.createdAt,
        completedAt: data.completedAt,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'goals');
    return [];
  }
}

export async function createGoal(goal: Omit<Goal, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'goals'), {
      ...goal,
      createdAt: goal.createdAt || new Date().toISOString(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'goals');
    throw error;
  }
}

export async function updateGoalProgress(goalId: string, amount: number): Promise<void> {
  try {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDocs(query(collection(db, 'goals'), where('__name__', '==', goalId)));
    if (snap.empty) return;
    const current = Number(snap.docs[0].data().currentAmount) || 0;
    const newAmount = current + amount;
    const updates: any = { currentAmount: newAmount };
    if (newAmount >= Number(snap.docs[0].data().targetAmount)) {
      updates.status = 'completed';
      updates.completedAt = new Date().toISOString();
    }
    await updateDoc(ref, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    throw error;
  }
}

export async function deleteGoal(goalId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'goals', goalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `goals/${goalId}`);
    throw error;
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
