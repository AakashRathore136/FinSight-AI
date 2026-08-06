/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Flame,
  Sparkles,
  Award,
  Plus,
  RefreshCw,
  TrendingUp,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { cn, formatCurrency } from '@/src/lib/utils';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  type Challenge,
  type SpendingPattern,
  type Difficulty,
  type BadgeTier,
  BADGE_META,
  DIFFICULTY_REWARDS,
  generateWeeklyChallenges,
  generateMonthlyChallenges,
  generateRecommendations,
  calculateDifficulty,
  awardBadge,
  getProgressPercentage,
  createChallenge,
  updateChallengeProgress,
  completeChallenge,
  deleteChallenge,
} from '@/src/lib/challengeUtils';
import { ChallengeCard } from './ChallengeCard';

interface ChallengesDashboardProps {
  user: import('firebase/auth').User | null;
}

function getEmptySpending(): SpendingPattern {
  return {
    totalMonthlySpend: 2000,
    coffeeSpend: 40,
    diningSpend: 220,
    subscriptionsSpend: 45,
    entertainmentSpend: 120,
    topCategory: 'Dining',
    discretionarySpend: 425,
    savingsRate: 0.08,
  };
}

export function ChallengesDashboard({ user }: ChallengesDashboardProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const spending = useMemo<SpendingPattern>(() => getEmptySpending(), []);

  useEffect(() => {
    if (!user) {
      setChallenges([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'challenges'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched: Challenge[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetched.push({
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
        fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setChallenges(fetched);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching challenges:', error);
        handleFirestoreError(error, OperationType.LIST, 'challenges');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const weeklyChallenges = useMemo(
    () => challenges.filter((c) => c.type === 'weekly'),
    [challenges]
  );
  const monthlyChallenges = useMemo(
    () => challenges.filter((c) => c.type === 'monthly'),
    [challenges]
  );
  const completedChallenges = useMemo(
    () => challenges.filter((c) => c.isCompleted),
    [challenges]
  );
  const activeChallenges = useMemo(
    () => challenges.filter((c) => !c.isCompleted),
    [challenges]
  );

  const recommendations = useMemo(() => generateRecommendations(spending), [spending]);

  const stats = useMemo(() => {
    const totalPoints = challenges.reduce(
      (sum, c) => sum + (c.isCompleted ? DIFFICULTY_REWARDS[c.difficulty].points : 0),
      0
    );
    const avgProgress = activeChallenges.length
      ? activeChallenges.reduce(
          (sum, c) => sum + getProgressPercentage(c.currentProgress, c.targetAmount),
          0
        ) / activeChallenges.length
      : 0;
    const earnedBadges = completedChallenges.reduce<Record<BadgeTier, number>>(
      (acc, c) => {
        acc[c.badge] = (acc[c.badge] || 0) + 1;
        return acc;
      },
      { bronze: 0, silver: 0, gold: 0, platinum: 0 }
    );
    return { totalPoints, avgProgress: Math.round(avgProgress), earnedBadges };
  }, [challenges, completedChallenges, activeChallenges]);

  const handleLogProgress = useCallback(
    async (challengeId: string, amount: number) => {
      const challenge = challenges.find((c) => c.id === challengeId);
      if (!challenge) return;
      const newProgress = Math.min(challenge.currentProgress + amount, challenge.targetAmount);
      try {
        await updateChallengeProgress(challengeId, newProgress);
        toast.success(`Logged ${formatCurrency(amount)} saved`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `challenges/${challengeId}`);
        toast.error('Failed to log progress');
      }
    },
    [challenges]
  );

  const handleComplete = useCallback(
    async (challenge: Challenge) => {
      const updatedProgress = Math.max(challenge.currentProgress, challenge.targetAmount);
      const badge = awardBadge(challenge);
      try {
        await updateChallengeProgress(challenge.id, updatedProgress);
        await completeChallenge(challenge.id, badge);
        toast.success(`Challenge complete! Earned ${BADGE_META[badge].label} badge`, {
          description: `+${DIFFICULTY_REWARDS[challenge.difficulty].points} points`,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `challenges/${challenge.id}`);
        toast.error('Failed to complete challenge');
      }
    },
    []
  );

  const handleDelete = useCallback(async (challengeId: string) => {
    try {
      await deleteChallenge(challengeId);
      toast.success('Challenge removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `challenges/${challengeId}`);
      toast.error('Failed to remove challenge');
    }
  }, []);

  const generateChallenges = useCallback(async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const difficulty: Difficulty = calculateDifficulty(spending);
      const weekly = generateWeeklyChallenges(spending);
      const monthly = generateMonthlyChallenges(spending);
      const all = [...weekly, ...monthly];

      let created = 0;
      for (const data of all) {
        await createChallenge(user.uid, { ...data, difficulty });
        created++;
      }
      toast.success(`Generated ${created} personalized challenges (${difficulty} difficulty)`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'challenges');
      toast.error('Failed to generate challenges');
    } finally {
      setGenerating(false);
    }
  }, [user, spending]);

  const renderGrid = (items: Challenge[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AnimatePresence>
        {items.map((challenge) => (
          <motion.div
            key={challenge.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <ChallengeCard
              challenge={challenge}
              onLogProgress={handleLogProgress}
              onComplete={handleComplete}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
            <Trophy className="h-6 w-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Savings Challenges</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Personalized goals, progress tracking, and achievement badges
            </p>
          </div>
        </div>
        <Button
          onClick={generateChallenges}
          disabled={generating || !user}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold text-sm shadow-lg shadow-yellow-900/20 rounded-xl h-10 px-4"
        >
          {generating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate Challenges
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Target className="h-4 w-4 text-indigo-400" />} label="Active" value={String(activeChallenges.length)} />
        <StatCard icon={<Trophy className="h-4 w-4 text-yellow-400" />} label="Completed" value={String(completedChallenges.length)} />
        <StatCard icon={<Award className="h-4 w-4 text-cyan-300" />} label="Points" value={String(stats.totalPoints)} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} label="Avg Progress" value={`${stats.avgProgress}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="weekly" className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1">
              <TabsTrigger value="weekly" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Flame className="mr-2 h-4 w-4" /> Weekly ({weeklyChallenges.length})
              </TabsTrigger>
              <TabsTrigger value="monthly" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <TrendingUp className="mr-2 h-4 w-4" /> Monthly ({monthlyChallenges.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Trophy className="mr-2 h-4 w-4" /> History ({completedChallenges.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="weekly" className="mt-4">
              {weeklyChallenges.length === 0 ? (
                <EmptyState onGenerate={generateChallenges} />
              ) : (
                renderGrid(weeklyChallenges)
              )}
            </TabsContent>

            <TabsContent value="monthly" className="mt-4">
              {monthlyChallenges.length === 0 ? (
                <EmptyState onGenerate={generateChallenges} />
              ) : (
                renderGrid(monthlyChallenges)
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {completedChallenges.length === 0 ? (
                <Card className="border-slate-800 bg-slate-900 rounded-2xl">
                  <CardContent className="py-12 text-center text-slate-500 text-sm">
                    No completed challenges yet. Finish a challenge to earn your first badge!
                  </CardContent>
                </Card>
              ) : (
                renderGrid(completedChallenges)
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-400" />
                AI Recommendations
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Based on your spending behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{rec.title}</p>
                    <Badge variant="outline" className={cn(
                      'text-[10px] uppercase tracking-wider',
                      rec.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : rec.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                    )}>
                      {rec.difficulty}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{rec.description}</p>
                  <p className="text-[10px] text-yellow-500/80 uppercase tracking-wider">{rec.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-cyan-300" />
                Achievement Badges
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Earn tiers by completing challenges
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {(Object.keys(BADGE_META) as BadgeTier[]).map((tier) => {
                const meta = BADGE_META[tier];
                const earned = stats.earnedBadges[tier];
                return (
                  <div
                    key={tier}
                    className={cn(
                      'rounded-xl border p-3 text-center',
                      earned > 0 ? meta.color : 'border-slate-800 bg-slate-800/30 text-slate-600'
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider">{meta.label}</p>
                    <p className="text-[10px] mt-1">{earned} earned</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-lg font-bold text-white tabular-nums">{value}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
      <CardContent className="py-16 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
          <Trophy className="h-8 w-8 text-slate-500" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-1">No challenges yet</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          Generate personalized savings challenges tuned to your spending habits.
        </p>
        <Button
          onClick={onGenerate}
          className="mt-6 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold text-sm rounded-xl h-10 px-6"
        >
          <Plus className="mr-2 h-4 w-4" />
          Generate Challenges
        </Button>
      </CardContent>
    </Card>
  );
}
