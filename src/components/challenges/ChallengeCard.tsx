import { useState } from 'react';
import { Flame, CheckCircle2, Award, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Progress, ProgressIndicator, ProgressTrack } from '@/src/components/ui/progress';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { cn, formatCurrency } from '@/src/lib/utils';
import {
  type Challenge,
  type Difficulty,
  DIFFICULTY_REWARDS,
  BADGE_META,
  getProgressPercentage,
} from '@/src/lib/challengeUtils';

interface ChallengeCardProps {
  challenge: Challenge;
  onLogProgress: (challengeId: string, amount: number) => void;
  onComplete: (challenge: Challenge) => void;
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  hard: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const TYPE_ICON = {
  weekly: Flame,
  monthly: TrendingDown,
};

export function ChallengeCard({ challenge, onLogProgress, onComplete }: ChallengeCardProps) {
  const [amountInput, setAmountInput] = useState('');
  const progress = getProgressPercentage(challenge.currentProgress, challenge.targetAmount);
  const TypeIcon = TYPE_ICON[challenge.type];
  const difficultyMeta = DIFFICULTY_REWARDS[challenge.difficulty];
  const badgeMeta = BADGE_META[challenge.badge];

  const handleLog = () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return;
    onLogProgress(challenge.id, amount);
    setAmountInput('');
  };

  return (
    <Card className={cn(
      'border-slate-800 bg-slate-900 shadow-lg shadow-black/20 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors duration-200',
      challenge.isCompleted && 'border-yellow-500/20'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border',
              challenge.isCompleted ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-indigo-500/10 border-indigo-500/30'
            )}>
              {challenge.isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-yellow-400" />
              ) : (
                <TypeIcon className={cn('h-5 w-5', challenge.type === 'weekly' ? 'text-orange-400' : 'text-indigo-400')} />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-white font-semibold truncate text-base">
                {challenge.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', DIFFICULTY_COLOR[challenge.difficulty])}>
                  {difficultyMeta.label}
                </Badge>
                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', badgeMeta.color)}>
                  <Award className="mr-1 h-3 w-3" />
                  {badgeMeta.label}
                </Badge>
                <span className="text-xs text-slate-500 capitalize">{challenge.type}</span>
              </div>
            </div>
          </div>
        </div>
        <CardDescription className="text-slate-500 text-xs mt-1">
          {challenge.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              {formatCurrency(challenge.currentProgress)} of {formatCurrency(challenge.targetAmount)}
            </span>
            <span className="text-white font-semibold tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress}>
            <ProgressTrack>
              <ProgressIndicator
                className={cn(
                  'h-full transition-all',
                  challenge.isCompleted ? 'bg-yellow-500' : progress > 0 ? 'bg-indigo-500' : 'bg-slate-700'
                )}
                style={{ width: `${progress}%` }}
              />
            </ProgressTrack>
          </Progress>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="uppercase tracking-wider">Reward</span>
          <span className="text-yellow-400 font-semibold">{difficultyMeta.points} pts</span>
        </div>

        {!challenge.isCompleted && (
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Log saved amount..."
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 rounded-lg text-xs"
              min="0"
              step="0.01"
            />
            <Button
              onClick={handleLog}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold h-9 px-3 rounded-lg"
            >
              Log
            </Button>
            <Button
              onClick={() => onComplete(challenge)}
              variant="outline"
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-xs font-semibold h-9 px-3 rounded-lg"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Done
            </Button>
          </div>
        )}

        {challenge.isCompleted && (
          <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Completed — {badgeMeta.label} badge earned ({difficultyMeta.points} pts)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
