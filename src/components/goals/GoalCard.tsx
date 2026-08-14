import { useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { Target, Calendar, TrendingUp, MoreVertical, Pause, Play, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Progress, ProgressIndicator, ProgressTrack } from '@/src/components/ui/progress';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { cn, formatCurrency, formatDateSafe } from '@/src/lib/utils';
import {
  type Goal,
  getProgressPercentage,
  calculateDaysRemaining,
  calculateMonthlyContribution,
  getGoalStatus,
} from '@/src/lib/goalUtils';

interface GoalCardProps {
  goal: Goal;
  onUpdateAmount: (goalId: string, amount: number) => Promise<void> | void;
  onViewDetails: (goal: Goal) => void;
  onStatusChange: (goalId: string, status: Goal['status']) => void;
  onDelete: (goalId: string) => void;
  /** Base currency for displayed figures. Defaults to the app-wide default. */
  baseCurrency?: string;
}

export function GoalCard({
  goal,
  onUpdateAmount,
  onViewDetails,
  onStatusChange,
  onDelete,
  baseCurrency,
}: GoalCardProps) {
  const [amountInput, setAmountInput] = useState('');
  const [adding, setAdding] = useState(false);
  const daysRemaining = calculateDaysRemaining(goal.deadline);
  const progress = getProgressPercentage(goal.currentAmount, goal.targetAmount);
  const monthlyContribution = calculateMonthlyContribution(
    goal.targetAmount,
    goal.currentAmount,
    goal.deadline
  );
  const status = getGoalStatus(goal);

  const handleAddContribution = async () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return;
    setAdding(true);
    try {
      await onUpdateAmount(goal.id, amount);
      setAmountInput('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg shadow-black/20 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
              <Target className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-white font-semibold truncate text-base">
                {goal.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', status.color)}>
                  {status.label}
                </Badge>
                <span className="text-xs text-slate-500">{goal.category}</span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-300">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-300">
              <DropdownMenuItem onClick={() => onViewDetails(goal)} className="cursor-pointer">
                View Details
              </DropdownMenuItem>
              {goal.status === 'active' && (
                <DropdownMenuItem onClick={() => onStatusChange(goal.id, 'paused')} className="cursor-pointer">
                  <Pause className="mr-2 h-4 w-4" />
                  Pause Goal
                </DropdownMenuItem>
              )}
              {goal.status === 'paused' && (
                <DropdownMenuItem onClick={() => onStatusChange(goal.id, 'active')} className="cursor-pointer">
                  <Play className="mr-2 h-4 w-4" />
                  Resume Goal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDelete(goal.id)} className="cursor-pointer text-red-400">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              {formatCurrency(goal.currentAmount, baseCurrency)} of {formatCurrency(goal.targetAmount, baseCurrency)}
            </span>
            <span className="text-white font-semibold tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress}>
            <ProgressTrack>
              <ProgressIndicator
                className={cn(
                  'h-full transition-all',
                  progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </ProgressTrack>
          </Progress>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Calendar size={12} />
              <span>Deadline</span>
            </div>
            <p className="text-sm font-semibold text-white">
              {daysRemaining == null
                ? 'No deadline'
                : daysRemaining > 0
                  ? `${daysRemaining} days left`
                  : 'Overdue'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {formatDateSafe(goal.deadline)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <TrendingUp size={12} />
              <span>Monthly Target</span>
            </div>
            <p className="text-sm font-semibold text-white">
              {formatCurrency(monthlyContribution, baseCurrency)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              per month to reach goal
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Add contribution..."
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 rounded-lg text-xs"
            min="0"
            step="0.01"
            disabled={adding}
          />
          <Button
            onClick={handleAddContribution}
            disabled={adding}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold h-9 px-3 rounded-lg"
          >
            {adding ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
