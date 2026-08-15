/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useBaseCurrency } from '@/src/hooks/useBaseCurrency';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  Target,
  Plus,
  Calendar,
  TrendingUp,
  X,
  BarChart3,
  CheckCircle2,
  Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Progress, ProgressTrack, ProgressIndicator } from '@/src/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { cn, formatCurrency, toDate } from '@/src/lib/utils';
import { GoalCard } from './GoalCard';
import {
  type Goal,
  calculateMonthlyContribution,
  calculateDaysRemaining,
  getProgressPercentage,
  generateContributionSuggestions,
  generateTimelineProjection,
  getGoalStatus,
} from '@/src/lib/goalUtils';

interface GoalPlannerProps {
  user: import('firebase/auth').User | null;
}

type GoalCategory = 'Savings' | 'Investment' | 'Debt' | 'Retirement' | 'Emergency' | 'Other';

const CATEGORIES: GoalCategory[] = ['Savings', 'Investment', 'Debt', 'Retirement', 'Emergency', 'Other'];

export function GoalPlanner({ user }: GoalPlannerProps) {
  const baseCurrency = useBaseCurrency(user);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) || null;
  const [selectedSuggestionLevel, setSelectedSuggestionLevel] = useState<'Recommended' | 'Conservative' | 'Aggressive'>('Recommended');
  const notifiedGoalIds = useRef(new Set<string>());
  const updatingGoalIds = useRef(new Set<string>());

  const [formName, setFormName] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formCategory, setFormCategory] = useState<GoalCategory>('Savings');
  const [formInitialAmount, setFormInitialAmount] = useState('0');

  useEffect(() => {
    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    const goalsRef = collection(db, 'goals');
    const q = query(goalsRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedGoals: Goal[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedGoals.push({
            id: docSnap.id,
            userId: data.userId || '',
            name: data.name || '',
            targetAmount: data.targetAmount || 0,
            currentAmount: data.currentAmount || 0,
            deadline: data.deadline || '',
            category: data.category || 'Other',
            suggestedMonthlyContribution: data.suggestedMonthlyContribution || 0,
            status: data.status || 'active',
            createdAt: data.createdAt || '',
            completedAt: data.completedAt,
          } as Goal);
        });

        fetchedGoals.sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;
          const ta = a.createdAt ? toDate(a.createdAt)?.getTime() ?? 0 : 0;
          const tb = b.createdAt ? toDate(b.createdAt)?.getTime() ?? 0 : 0;
          return tb - ta;
        });

        setGoals(fetchedGoals);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching goals:', error);
        handleFirestoreError(error, OperationType.LIST, 'goals');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    goals.forEach((goal) => {
      if (goal.status === 'completed' || goal.status === 'paused') return;
      if (notifiedGoalIds.current.has(goal.id)) return;
      if (updatingGoalIds.current.has(goal.id)) return;
      const isComplete = goal.currentAmount >= goal.targetAmount;
      if (isComplete) {
        notifiedGoalIds.current.add(goal.id);
        updatingGoalIds.current.add(goal.id);
        toast.success(`Goal reached: ${goal.name}!`, {
          description: `You've reached ${formatCurrency(goal.targetAmount, baseCurrency)}.`,
          duration: 5000,
        });
        updateGoalStatus(goal.id, 'completed', goal.currentAmount).finally(() => {
          updatingGoalIds.current.delete(goal.id);
        });
      }
    });
  }, [goals, user]);

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active'),
    [goals]
  );

  const completedGoals = useMemo(
    () => goals.filter((g) => g.status === 'completed'),
    [goals]
  );

  const pausedGoals = useMemo(
    () => goals.filter((g) => g.status === 'paused'),
    [goals]
  );

  const createGoal = async () => {
    if (!user) return;
    if (!formName.trim()) {
      toast.error('Please enter a goal name');
      return;
    }
    const targetAmount = parseFloat(formTarget);
    if (isNaN(targetAmount) || targetAmount <= 0) {
      toast.error('Please enter a valid target amount');
      return;
    }
    if (!formDeadline) {
      toast.error('Please select a deadline');
      return;
    }

    const initialAmount = parseFloat(formInitialAmount) || 0;
    const monthlyContribution = calculateMonthlyContribution(targetAmount, initialAmount, formDeadline);

    try {
      const newGoal: Omit<Goal, 'id'> = {
        userId: user.uid,
        name: formName.trim(),
        targetAmount,
        currentAmount: initialAmount,
        deadline: formDeadline,
        category: formCategory,
        suggestedMonthlyContribution: monthlyContribution,
        status: "active",
        createdAt: new Date().toISOString(),
      };

      const docRef = doc(collection(db, 'goals'));
      await setDoc(docRef, {
        ...newGoal,
        createdAt: serverTimestamp(),
      });

      toast.success('Goal created successfully');
      setFormName('');
      setFormTarget('');
      setFormDeadline('');
      setFormCategory('Savings');
      setFormInitialAmount('0');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating goal:', error);
      handleFirestoreError(error, OperationType.CREATE, 'goals');
      toast.error('Failed to create goal');
    }
  };

  const updateGoalAmount = async (goalId: string, addedAmount: number) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;

    // Guard against the auto-complete effect writing a stale snapshot while a
    // contribution is in flight: it skips goals present in updatingGoalIds.
    updatingGoalIds.current.add(goalId);
    try {
      // Apply the contribution atomically on the server so two rapid adds (or
      // an add racing the auto-complete write) can never overwrite each other.
      await updateDoc(doc(db, 'goals', goalId), {
        currentAmount: increment(addedAmount),
      });
      toast.success(`Added ${formatCurrency(addedAmount, baseCurrency)} to ${goal.name}`);
    } catch (error) {
      console.error('Error updating goal:', error);
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
      toast.error('Failed to update goal');
    } finally {
      updatingGoalIds.current.delete(goalId);
    }
  };

  const updateGoalStatus = async (goalId: string, status: Goal['status'], completedAmount?: number) => {
    try {
      const updateData: any = { status };
      if (status === 'completed') {
        updateData.completedAt = serverTimestamp();
        if (completedAmount !== undefined) {
          updateData.currentAmount = completedAmount;
        }
      }
      await updateDoc(doc(db, 'goals', goalId), updateData);
    } catch (error) {
      console.error('Error updating goal status:', error);
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      await deleteDoc(doc(db, 'goals', goalId));
      toast.success('Goal deleted');
      if (selectedGoalId === goalId) setSelectedGoalId(null);
    } catch (error) {
      console.error('Error deleting goal:', error);
      handleFirestoreError(error, OperationType.DELETE, `goals/${goalId}`);
      toast.error('Failed to delete goal');
    }
  };

  const handleCompleteGoal = (goalId: string) => {
    updateGoalStatus(goalId, 'completed');
    toast.success('Goal marked as completed');
  };

  const goalDetail = selectedGoal
    ? {
        ...selectedGoal,
        daysRemaining: calculateDaysRemaining(selectedGoal.deadline),
        progress: getProgressPercentage(selectedGoal.currentAmount, selectedGoal.targetAmount),
        monthlyContribution: calculateMonthlyContribution(
          selectedGoal.targetAmount,
          selectedGoal.currentAmount,
          selectedGoal.deadline
        ),
        suggestions: generateContributionSuggestions(
          selectedGoal.targetAmount,
          selectedGoal.currentAmount,
          selectedGoal.deadline
        ),
        timeline: (() => {
          const suggestions = generateContributionSuggestions(
            selectedGoal.targetAmount,
            selectedGoal.currentAmount,
            selectedGoal.deadline
          );
          const selected = suggestions.find((s) => s.label === selectedSuggestionLevel) ?? suggestions[0];
          return generateTimelineProjection(
            selectedGoal.targetAmount,
            selectedGoal.currentAmount,
            selected.amount
          );
        })(),
      }
    : null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Financial Goals</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Track, plan, and achieve your financial objectives
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-900/20 rounded-xl h-10 px-4"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Goal
        </Button>
      </div>

      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">Create New Goal</CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-1">
                      Set a target and track your progress
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-500 hover:text-slate-300 h-8 w-8"
                  >
                    <X size={16} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Goal Name
                    </label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Emergency Fund"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as GoalCategory)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none text-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Target Amount
                    </label>
                    <Input
                      type="number"
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Initial Contribution
                    </label>
                    <Input
                      type="number"
                      value={formInitialAmount}
                      onChange={(e) => setFormInitialAmount(e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Deadline
                    </label>
                    <Input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-400 hover:text-slate-300 rounded-lg h-9 px-4 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={createGoal}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg h-9 px-6 text-sm"
                  >
                    Create Goal
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {activeGoals.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">Active Goals</h2>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[10px] uppercase tracking-wider">
                  {activeGoals.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {activeGoals.map((goal) => (
                    <motion.div
                      key={goal.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <GoalCard
                        goal={goal}
                        baseCurrency={baseCurrency}
                        onUpdateAmount={updateGoalAmount}
                        onViewDetails={(g) => setSelectedGoalId(g.id)}
                        onStatusChange={(id, status) => updateGoalStatus(id, status)}
                        onDelete={deleteGoal}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {pausedGoals.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Pause className="h-4 w-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-white">Paused Goals</h2>
                <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30 text-[10px] uppercase tracking-wider">
                  {pausedGoals.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {pausedGoals.map((goal) => (
                    <motion.div
                      key={goal.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <GoalCard
                        goal={goal}
                        baseCurrency={baseCurrency}
                        onUpdateAmount={updateGoalAmount}
                        onViewDetails={(g) => setSelectedGoalId(g.id)}
                        onStatusChange={(id, status) => updateGoalStatus(id, status)}
                        onDelete={deleteGoal}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {completedGoals.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Completed Goals</h2>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase tracking-wider">
                  {completedGoals.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedGoals.map((goal) => (
                  <motion.div
                    key={goal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <GoalCard
                      goal={goal}
                      baseCurrency={baseCurrency}
                      onUpdateAmount={updateGoalAmount}
                      onViewDetails={(g) => setSelectedGoalId(g.id)}
                      onStatusChange={(id, status) => updateGoalStatus(id, status)}
                      onDelete={deleteGoal}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {!loading && goals.length === 0 && (
            <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
              <CardContent className="py-16 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <Target className="h-8 w-8 text-slate-500" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">No goals yet</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">
                  Create your first financial goal to start tracking your progress and building your future.
                </p>
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl h-10 px-6"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Goal
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!goalDetail}               onOpenChange={(open) => !open && setSelectedGoalId(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-white">{goalDetail?.name}</DialogTitle>
                <DialogDescription className="text-slate-500 text-xs mt-1">
                  {goalDetail?.category} goal
                </DialogDescription>
              </div>
              <Badge variant="outline" className={cn(getGoalStatus(goalDetail as Goal).color)}>
                {getGoalStatus(goalDetail as Goal).label}
              </Badge>
            </div>
          </DialogHeader>

          {goalDetail && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Target</p>
                  <p className="text-white font-semibold text-sm">{formatCurrency(goalDetail.targetAmount, baseCurrency)}</p>
                </div>
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current</p>
                  <p className="text-white font-semibold text-sm">{formatCurrency(goalDetail.currentAmount, baseCurrency)}</p>
                </div>
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Remaining</p>
                  <p className="text-white font-semibold text-sm">
                    {formatCurrency(goalDetail.targetAmount - goalDetail.currentAmount, baseCurrency)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-white font-semibold tabular-nums">{goalDetail.progress}%</span>
                </div>
                <Progress value={goalDetail.progress}>
                  <ProgressTrack>
                    <ProgressIndicator
                      className={cn(
                        'h-full transition-all',
                        goalDetail.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                      )}
                      style={{ width: `${Math.min(100, goalDetail.progress)}%` }}
                    />
                  </ProgressTrack>
                </Progress>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-indigo-400" />
                  Timeline Projection
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={goalDetail.timeline}>
                      <defs>
                        <linearGradient id="goalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="month"
                        stroke="#475569"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                      />
                      <YAxis
                        stroke="#475569"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(value) => formatCurrency(value, baseCurrency)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #1e293b',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(value: number) => [formatCurrency(value, baseCurrency), 'Projected']}
                      />
                      <Area
                        type="monotone"
                        dataKey="projected"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#goalGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Contribution Suggestions
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {goalDetail.suggestions.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      onClick={() => setSelectedSuggestionLevel(suggestion.label)}
                      className={`rounded-xl p-3 text-center transition-all ${
                        selectedSuggestionLevel === suggestion.label
                          ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_0_1px]_indigo-500/50'
                          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        {suggestion.label}
                      </p>
                      <p className="text-white font-semibold text-sm">
                        {formatCurrency(suggestion.amount, baseCurrency)}
                      </p>
                      <p className="text-[10px] text-slate-500">/month</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Calendar className="h-3 w-3" />
                  <span>Deadline: {format(new Date(goalDetail.deadline), 'MMM d, yyyy')}</span>
                  <span className="text-slate-600">
                    ({goalDetail.daysRemaining == null ? 'no deadline' : `${goalDetail.daysRemaining} days remaining`})
                  </span>
                </div>
                <div className="flex gap-2">
                  {goalDetail.status === 'active' && goalDetail.progress >= 100 && (
                    <Button
                      onClick={() => handleCompleteGoal(goalDetail.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg h-8 px-3"
                    >
                      Mark Complete
                    </Button>
                  )}
                  {goalDetail.status === 'active' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        updateGoalStatus(goalDetail.id, 'paused');
                        toast.success('Goal paused');
                      }}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs rounded-lg h-8 px-3"
                    >
                      <Pause className="mr-1 h-3 w-3" />
                      Pause
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
