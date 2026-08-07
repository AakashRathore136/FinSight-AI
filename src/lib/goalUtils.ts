import { format, differenceInDays, addMonths } from 'date-fns';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */

export interface Goal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  category: string;
  suggestedMonthlyContribution: number;
  status: "active" | "completed" | "paused";
  createdAt: string;
  completedAt?: string;
}

export function calculateMonthlyContribution(
  targetAmount: number,
  currentAmount: number,
  deadline: string
): number {
  const remaining = targetAmount - currentAmount;
  if (remaining <= 0) return 0;

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const monthsRemaining = Math.max(1, differenceInDays(deadlineDate, now) / 30);

  return Math.ceil(remaining / monthsRemaining);
}

export function checkGoalCompletion(goal: Goal): boolean {
  return goal.currentAmount >= goal.targetAmount && goal.status !== 'completed';
}

export function calculateDaysRemaining(deadline: string): number {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const days = differenceInDays(deadlineDate, now);
  return Math.max(0, days);
}

export function generateContributionSuggestions(
  targetAmount: number,
  currentAmount: number,
  deadline: string,
  options: {
    conservative?: boolean;
    aggressive?: boolean;
  } = {}
): { label: string; amount: number }[] {
  const remaining = targetAmount - currentAmount;
  if (remaining <= 0) return [{ label: 'Goal reached', amount: 0 }];

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const monthsRemaining = Math.max(1, differenceInDays(deadlineDate, now) / 30);
  const baseMonthly = Math.ceil(remaining / monthsRemaining);

  const suggestions = [
    {
      label: 'Recommended',
      amount: baseMonthly,
    },
    {
      label: 'Conservative',
      amount: Math.ceil(baseMonthly * (options.conservative ? 1.2 : 0.85)),
    },
    {
      label: 'Aggressive',
      amount: Math.max(1, Math.floor(baseMonthly * (options.aggressive ? 0.85 : 1.2))),
    },
  ];

  return suggestions;
}

export function generateTimelineProjection(
  targetAmount: number,
  currentAmount: number,
  monthlyContribution: number
): { month: string; projected: number }[] {
  if (monthlyContribution <= 0) return [];

  const now = new Date();
  const projection: { month: string; projected: number }[] = [];
  let running = currentAmount;

  for (let i = 1; i <= 24 && running < targetAmount; i++) {
    running += monthlyContribution;
    if (running > targetAmount) running = targetAmount;
    projection.push({
      month: format(addMonths(now, i), 'MMM yyyy'),
      projected: Math.round(running),
    });
  }

  return projection;
}

export function getProgressPercentage(currentAmount: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentAmount / targetAmount) * 100));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getGoalStatus(goal: Goal): { label: string; color: string } {
  const daysRemaining = calculateDaysRemaining(goal.deadline);
  if (goal.status === 'completed') return { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
  if (goal.status === 'paused') return { label: 'Paused', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30' };

  const progress = getProgressPercentage(goal.currentAmount, goal.targetAmount);
  if (progress >= 100) return { label: 'Ready to Complete', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
  if (daysRemaining <= 30) return { label: 'Urgent', color: 'bg-red-500/10 text-red-400 border-red-500/30' };
  if (daysRemaining <= 90) return { label: 'At Risk', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };

  return { label: 'On Track', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
}
