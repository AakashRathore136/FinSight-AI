import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { formatCurrency } from '@/src/lib/utils';

export type ChallengeType = 'weekly' | 'monthly';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Challenge {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: ChallengeType;
  difficulty: Difficulty;
  targetAmount: number;
  currentProgress: number;
  isCompleted: boolean;
  badge: BadgeTier;
  createdAt: string;
  completedAt?: string;
}

export interface SpendingPattern {
  totalMonthlySpend: number;
  coffeeSpend: number;
  diningSpend: number;
  subscriptionsSpend: number;
  entertainmentSpend: number;
  topCategory: string;
  discretionarySpend: number;
  savingsRate: number;
}

export const DIFFICULTY_REWARDS: Record<Difficulty, { points: number; label: string }> = {
  easy: { points: 50, label: 'Easy' },
  medium: { points: 150, label: 'Medium' },
  hard: { points: 400, label: 'Hard' },
};

export const BADGE_META: Record<BadgeTier, { label: string; color: string; points: number }> = {
  bronze: { label: 'Bronze', color: 'text-amber-700 border-amber-700/30 bg-amber-700/10', points: 100 },
  silver: { label: 'Silver', color: 'text-slate-300 border-slate-400/30 bg-slate-400/10', points: 300 },
  gold: { label: 'Gold', color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10', points: 750 },
  platinum: { label: 'Platinum', color: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10', points: 1500 },
};

export function getProgressPercentage(currentProgress: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentProgress / targetAmount) * 100));
}

export function calculateDifficulty(spending: SpendingPattern): Difficulty {
  const discretionaryRatio = spending.totalMonthlySpend > 0
    ? spending.discretionarySpend / spending.totalMonthlySpend
    : 0;

  if (spending.savingsRate >= 0.25 || discretionaryRatio < 0.25) return 'easy';
  if (spending.savingsRate >= 0.1 || discretionaryRatio < 0.5) return 'medium';
  return 'hard';
}

function scaleTarget(base: number, difficulty: Difficulty): number {
  if (difficulty === 'easy') return Math.round(base * 0.6);
  if (difficulty === 'medium') return Math.round(base * 1);
  return Math.round(base * 1.6);
}

export function generateWeeklyChallenges(spending: SpendingPattern): Omit<Challenge, 'id' | 'userId' | 'createdAt'>[] {
  const difficulty = calculateDifficulty(spending);
  const challenges: Omit<Challenge, 'id' | 'userId' | 'createdAt'>[] = [
    {
      title: 'No Coffee Shop Purchases This Week',
      description: 'Skip café and coffee-shop spending for 7 days. Brew at home and redirect the savings.',
      type: 'weekly',
      difficulty,
      targetAmount: Math.max(15, scaleTarget(spending.coffeeSpend || 25, difficulty)),
      currentProgress: 0,
      isCompleted: false,
      badge: 'bronze',
    },
    {
      title: `Save ${formatCurrency(scaleTarget(50, difficulty))} This Week`,
      description: 'Set aside a target amount from this week’s income into your savings.',
      type: 'weekly',
      difficulty,
      targetAmount: scaleTarget(50, difficulty),
      currentProgress: 0,
      isCompleted: false,
      badge: 'silver',
    },
    {
      title: 'Limit Dining Out To Twice This Week',
      description: 'Cut back on restaurant and takeout meals to keep discretionary spend in check.',
      type: 'weekly',
      difficulty,
      targetAmount: Math.max(30, scaleTarget(spending.diningSpend || 60, difficulty)),
      currentProgress: 0,
      isCompleted: false,
      badge: 'bronze',
    },
    {
      title: 'Pause One Subscription This Week',
      description: 'Cancel or pause a recurring subscription and save that amount this week.',
      type: 'weekly',
      difficulty: difficulty === 'hard' ? 'hard' : 'easy',
      targetAmount: Math.max(10, scaleTarget(spending.subscriptionsSpend || 20, difficulty)),
      currentProgress: 0,
      isCompleted: false,
      badge: 'bronze',
    },
  ];

  return challenges;
}

export function generateMonthlyChallenges(spending: SpendingPattern): Omit<Challenge, 'id' | 'userId' | 'createdAt'>[] {
  const difficulty = calculateDifficulty(spending);
  const challenges: Omit<Challenge, 'id' | 'userId' | 'createdAt'>[] = [
    {
      title: 'Reduce Dining Out By 30%',
      description: 'Lower your monthly restaurant and takeout spend by 30% versus your average.',
      type: 'monthly',
      difficulty,
      targetAmount: Math.round((spending.diningSpend || 200) * 0.3),
      currentProgress: 0,
      isCompleted: false,
      badge: 'gold',
    },
    {
      title: `Save ${formatCurrency(scaleTarget(200, difficulty))} This Month`,
      description: 'Build your emergency buffer by setting aside a monthly savings target.',
      type: 'monthly',
      difficulty,
      targetAmount: scaleTarget(200, difficulty),
      currentProgress: 0,
      isCompleted: false,
      badge: 'gold',
    },
    {
      title: 'Cut Entertainment Spend By 25%',
      description: 'Trim discretionary entertainment spending by a quarter this month.',
      type: 'monthly',
      difficulty,
      targetAmount: Math.round((spending.entertainmentSpend || 150) * 0.25),
      currentProgress: 0,
      isCompleted: false,
      badge: 'silver',
    },
    {
      title: 'Reach A 20% Savings Rate',
      description: 'Grow your monthly savings rate to at least 20% of total spend.',
      type: 'monthly',
      difficulty: 'hard',
      targetAmount: Math.round((spending.totalMonthlySpend || 2000) * 0.2),
      currentProgress: 0,
      isCompleted: false,
      badge: 'platinum',
    },
  ];

  return challenges;
}

export interface ChallengeRecommendation {
  title: string;
  description: string;
  difficulty: Difficulty;
  reason: string;
}

export function generateRecommendations(spending: SpendingPattern): ChallengeRecommendation[] {
  const recommendations: ChallengeRecommendation[] = [];
  const difficulty = calculateDifficulty(spending);

  if (spending.coffeeSpend > 30) {
    recommendations.push({
      title: 'No Coffee Shop Purchases',
      description: 'Your coffee-shop habit is high — skipping it for a week frees up real cash.',
      difficulty: 'easy',
      reason: `You spend about ${formatCurrency(spending.coffeeSpend)}/mo on coffee.`,
    });
  }

  if (spending.diningSpend > spending.coffeeSpend && spending.diningSpend > 150) {
    recommendations.push({
      title: 'Reduce Dining Out By 30%',
      description: 'Dining out is your top discretionary category — trimming it has the biggest impact.',
      difficulty,
      reason: `Dining out is ~${formatCurrency(spending.diningSpend)}/mo, your highest discretionary spend.`,
    });
  }

  if (spending.subscriptionsSpend > 40) {
    recommendations.push({
      title: 'Audit Subscriptions',
      description: 'You carry heavy subscription costs — pausing one saves every month.',
      difficulty: 'easy',
      reason: `Subscriptions total ~${formatCurrency(spending.subscriptionsSpend)}/mo.`,
    });
  }

  if (spending.savingsRate < 0.1) {
    recommendations.push({
      title: 'Build A Savings Buffer',
      description: 'Your savings rate is low — start with a small weekly auto-transfer.',
      difficulty: 'medium',
      reason: `Current savings rate is ${(spending.savingsRate * 100).toFixed(0)}% — below the recommended 10%.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Maintain Your Streak',
      description: 'Your spending looks healthy — keep it up with a light savings challenge.',
      difficulty: 'easy',
      reason: 'No major overspending detected. Keep building good habits.',
    });
  }

  return recommendations;
}

export function awardBadge(challenge: Challenge): BadgeTier {
  if (challenge.targetAmount >= 300) return 'platinum';
  if (challenge.targetAmount >= 150) return 'gold';
  if (challenge.targetAmount >= 50) return 'silver';
  return 'bronze';
}

export function trackProgress(challenge: Challenge, amountSaved: number): number {
  const updated = challenge.currentProgress + amountSaved;
  return Math.min(updated, challenge.targetAmount);
}

export function isChallengeComplete(currentProgress: number, targetAmount: number): boolean {
  return targetAmount > 0 && currentProgress >= targetAmount;
}

export async function createChallenge(userId: string, data: Omit<Challenge, 'id' | 'userId' | 'createdAt'>): Promise<string> {
  const docRef = doc(collection(db, 'challenges'));
  await setDoc(docRef, {
    ...data,
    userId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateChallengeProgress(challengeId: string, currentProgress: number): Promise<void> {
  const challengeSnap = await getDoc(doc(db, 'challenges', challengeId));
  if (!challengeSnap.exists()) return;

  const challenge = challengeSnap.data();
  const targetAmount = challenge.targetAmount as number;
  const completed = isChallengeComplete(currentProgress, targetAmount);

  await updateDoc(doc(db, 'challenges', challengeId), {
    currentProgress,
    ...(completed ? { isCompleted: true, completedAt: serverTimestamp() } : {}),
  });
}

export async function completeChallenge(challengeId: string, badge: BadgeTier): Promise<void> {
  await updateDoc(doc(db, 'challenges', challengeId), {
    isCompleted: true,
    completedAt: serverTimestamp(),
    badge,
  });
}

export async function deleteChallenge(challengeId: string): Promise<void> {
  await deleteDoc(doc(db, 'challenges', challengeId));
}

export async function getChallenges(userId: string): Promise<Challenge[]> {
  const q = query(
    collection(db, 'challenges'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  const challenges: Challenge[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    challenges.push({
      id: docSnap.id,
      userId: data.userId || '',
      title: data.title || '',
      description: data.description || '',
      type: data.type || 'weekly',
      difficulty: data.difficulty || 'easy',
      targetAmount: data.targetAmount || 0,
      currentProgress: data.currentProgress || 0,
      isCompleted: data.isCompleted || false,
      badge: data.badge || 'bronze',
      createdAt: data.createdAt || '',
      completedAt: data.completedAt,
    } as Challenge);
  });
  return challenges;
}

export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const snap = await getDoc(doc(db, 'challenges', challengeId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId || '',
    title: data.title || '',
    description: data.description || '',
    type: data.type || 'weekly',
    difficulty: data.difficulty || 'easy',
    targetAmount: data.targetAmount || 0,
    currentProgress: data.currentProgress || 0,
    isCompleted: data.isCompleted || false,
    badge: data.badge || 'bronze',
    createdAt: data.createdAt || '',
    completedAt: data.completedAt,
  } as Challenge;
}
