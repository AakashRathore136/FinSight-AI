/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import {
  HeartPulse,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Progress, ProgressTrack, ProgressIndicator } from '@/src/components/ui/progress';
import { cn } from '@/src/lib/utils';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  HealthGauge,
} from '@/src/components/health/HealthGauge';
import {
  type HealthScore,
  type HealthMetric,
  type HealthCategory,
  calculateSpendingScore,
  calculateSavingsScore,
  calculateBudgetAdherence,
  calculateOverallScore,
  generateImprovementSuggestions,
  compareMonthlyScores,
  getScoreColor,
  getScoreLabel,
  createHealthScore,
  getHealthScores,
  updateHealthScore,
} from '@/src/lib/healthUtils';
import { fetchBudgetCategories, type BudgetCategory } from '@/src/lib/budgetUtils';
import { fetchTransactions, type Transaction } from '@/src/lib/anomalyUtils';

interface HealthScoreDashboardProps {
  user: import('firebase/auth').User | null;
}

export function HealthScoreDashboard({ user }: HealthScoreDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [historicalScores, setHistoricalScores] = useState<HealthScore[]>([]);
  const [currentScore, setCurrentScore] = useState<HealthScore | null>(null);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setBudgetCategories([]);
      setLoading(false);
      return;
    }

    let active = true;
    const loadData = async () => {
      try {
        const now = new Date();
        const startDate = startOfMonth(subMonths(now, 5));
        const endDate = endOfMonth(now);

        const [txns, cats, scores] = await Promise.all([
          fetchTransactions(user.uid, 6),
          fetchBudgetCategories(user.uid),
          getHealthScores(user.uid, 12),
        ]);

        if (!active) return;

        const filtered = txns.filter((t) => {
          const date = t.date instanceof Date ? t.date : new Date(t.date as any);
          return date >= startDate && date <= endDate;
        });

        setTransactions(filtered);
        setBudgetCategories(cats);
        setHistoricalScores(scores);

        const existing = scores.find((s) => {
          const monthKey = format(now, 'yyyy-MM');
          return s.month === monthKey;
        });

        if (existing) {
          setCurrentScore(existing);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading health dashboard data:', error);
        handleFirestoreError(error, OperationType.LIST, 'health_dashboard');
        setLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [user]);

  const monthlyData = useMemo(() => {
    const data: { month: string; Spending: number; Savings: number; 'Budget Adherence': number; Overall: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const label = format(monthDate, 'MMM yyyy');
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);

      const monthTxns = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : new Date(t.date as any);
        return date >= start && date <= end;
      });

      const spending = calculateSpendingScore(monthTxns);
      const savings = calculateSavingsScore(monthTxns);
      const budget = calculateBudgetAdherence(monthTxns, budgetCategories);
      const overall = calculateOverallScore(spending, savings, budget);

      const historical = historicalScores.find((s) => s.month === monthKey);

      data.push({
        month: label,
        Spending: historical ? historical.spendingScore : spending,
        Savings: historical ? historical.savingsScore : savings,
        'Budget Adherence': historical ? historical.budgetAdherenceScore : budget,
        Overall: historical ? historical.overallScore : overall,
      });
    }

    return data;
  }, [transactions, budgetCategories, historicalScores]);

  const metrics = useMemo((): HealthMetric[] => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const monthTxns = transactions.filter((t) => {
      const date = t.date instanceof Date ? t.date : new Date(t.date as any);
      return date >= start && date <= end;
    });

    const spending = calculateSpendingScore(monthTxns);
    const savings = calculateSavingsScore(monthTxns);
    const budget = calculateBudgetAdherence(monthTxns, budgetCategories);
    const overall = calculateOverallScore(spending, savings, budget);

    return [
      {
        name: 'Spending',
        value: monthTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        score: spending,
        weight: 0.35,
        description: spending >= 80 ? 'Healthy spending patterns' : 'High discretionary spending detected',
      },
      {
        name: 'Savings',
        value: monthTxns.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) - monthTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        score: savings,
        weight: 0.35,
        description: savings >= 80 ? 'Strong savings rate' : 'Low savings rate relative to income',
      },
      {
        name: 'Budget Adherence',
        value: budgetCategories.reduce((sum, c) => sum + c.monthlyLimit, 0),
        score: budget,
        weight: 0.3,
        description: budget >= 80 ? 'Staying within budget limits' : 'Frequently exceeding budget categories',
      },
    ];
  }, [transactions, budgetCategories]);

  const overallScore = useMemo(() => {
    return calculateOverallScore(metrics[0]?.score || 0, metrics[1]?.score || 0, metrics[2]?.score || 0);
  }, [metrics]);

  const suggestions = useMemo(() => {
    return generateImprovementSuggestions(metrics);
  }, [metrics]);

  const previousScore = useMemo(() => {
    const now = new Date();
    const prevMonthKey = format(subMonths(now, 1), 'yyyy-MM');
    return historicalScores.find((s) => s.month === prevMonthKey);
  }, [historicalScores]);

  const trend = useMemo(() => {
    if (!previousScore) return null;
    return compareMonthlyScores(
      { ...currentScore, overallScore, spendingScore: metrics[0]?.score, savingsScore: metrics[1]?.score, budgetAdherenceScore: metrics[2]?.score } as HealthScore,
      previousScore
    );
  }, [previousScore, currentScore, metrics, overallScore]);

  const handleCalculate = async () => {
    if (!user) return;
    setCalculating(true);
    try {
      const now = new Date();
      const monthTxns = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : new Date(t.date as any);
        return date >= startOfMonth(now) && date <= endOfMonth(now);
      });

      const spending = calculateSpendingScore(monthTxns);
      const savings = calculateSavingsScore(monthTxns);
      const budget = calculateBudgetAdherence(monthTxns, budgetCategories);
      const overall = calculateOverallScore(spending, savings, budget);

      const monthKey = format(now, 'yyyy-MM');
      const existing = historicalScores.find((s) => s.month === monthKey);

      const metricsPayload: HealthMetric[] = [
        {
          name: 'Spending',
          value: monthTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
          score: spending,
          weight: 0.35,
          description: spending >= 80 ? 'Healthy spending patterns' : 'High discretionary spending detected',
        },
        {
          name: 'Savings',
          value: monthTxns.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) - monthTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
          score: savings,
          weight: 0.35,
          description: savings >= 80 ? 'Strong savings rate' : 'Low savings rate relative to income',
        },
        {
          name: 'Budget Adherence',
          value: budgetCategories.reduce((sum, c) => sum + c.monthlyLimit, 0),
          score: budget,
          weight: 0.3,
          description: budget >= 80 ? 'Staying within budget limits' : 'Frequently exceeding budget categories',
        },
      ];

      if (existing) {
        await updateHealthScore(existing.id, {
          overallScore: overall,
          spendingScore: spending,
          savingsScore: savings,
          budgetAdherenceScore: budget,
          metrics: metricsPayload,
        });
        const updatedScore = { ...existing, ...metricsPayload, overallScore: overall, spendingScore: spending, savingsScore: savings, budgetAdherenceScore: budget };
        setHistoricalScores((prev) =>
          prev.map((s) => (s.id === existing.id ? updatedScore : s))
        );
        setCurrentScore(updatedScore);
        toast.success('Health score recalculated');
      } else {
        const created = await createHealthScore({
          userId: user.uid,
          overallScore: overall,
          spendingScore: spending,
          savingsScore: savings,
          budgetAdherenceScore: budget,
          metrics: metricsPayload,
          month: monthKey,
        });
        if (created) {
          setHistoricalScores((prev) => [created, ...prev]);
          toast.success('Health score calculated and saved');
        } else {
          toast.error('Failed to save health score');
        }
      }
    } catch (error) {
      console.error('Error calculating health score:', error);
      handleFirestoreError(error, OperationType.WRITE, 'health_scores');
      toast.error('Failed to calculate health score');
    } finally {
      setCalculating(false);
    }
  };

  const renderTrend = (value: number) => {
    if (value > 0) return <TrendingUp className="h-3 w-3 text-emerald-400" />;
    if (value < 0) return <TrendingDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-slate-500" />;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <HeartPulse className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Financial Health Score</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Track your financial wellness with AI-powered insights
            </p>
          </div>
        </div>
        <Button
          onClick={handleCalculate}
          disabled={calculating || !user || loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-900/20 rounded-xl h-10 px-4"
        >
          {calculating ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {calculating ? 'Calculating...' : 'Calculate Score'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6 flex flex-col items-center justify-center">
                <HealthGauge value={overallScore} size={180} strokeWidth={14} label="Score" sublabel={getScoreLabel(overallScore)} />
                <div className="mt-4 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] uppercase tracking-wider',
                      overallScore >= 80
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : overallScore >= 60
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          : overallScore >= 40
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                    )}
                  >
                    {getScoreLabel(overallScore)}
                  </Badge>
                  {trend && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      {renderTrend(trend.overall)}
                      <span className="tabular-nums">{trend.overall > 0 ? '+' : ''}{trend.overall}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center max-w-[200px]">
                  {overallScore >= 80
                    ? 'Your finances are in excellent shape. Keep up the great work!'
                    : overallScore >= 60
                      ? 'Good progress. A few adjustments can push you to excellent.'
                      : overallScore >= 40
                        ? 'Room for improvement. Review the suggestions below.'
                        : 'Your financial health needs attention. Start with the highest priority tips.'}
                </p>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-4">
              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-400" />
                    Score Breakdown
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    How your subscores contribute to your overall health
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {metrics.map((metric) => (
                      <div key={metric.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{metric.name}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] uppercase tracking-wider',
                                metric.score >= 80
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : metric.score >= 60
                                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                    : metric.score >= 40
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                              )}
                            >
                              {metric.score}%
                            </Badge>
                          </div>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Weight: {Math.round(metric.weight * 100 + Number.EPSILON)}%</span>
                        </div>
                        <Progress value={metric.score}>
                          <ProgressTrack>
                            <ProgressIndicator
                              className={cn('h-full transition-all', getScoreColor(metric.score) === '#10b981' ? 'bg-emerald-500' : getScoreColor(metric.score) === '#6366f1' ? 'bg-indigo-500' : getScoreColor(metric.score) === '#f59e0b' ? 'bg-amber-500' : 'bg-red-500')}
                              style={{ width: `${metric.score}%` }}
                            />
                          </ProgressTrack>
                        </Progress>
                        <p className="text-[10px] text-slate-500">{metric.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div key={metric.name} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{metric.name}</p>
                    <p className="text-lg font-bold text-white tabular-nums">{metric.score}%</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: getScoreColor(metric.score) }}
                      />
                      <span className="text-[10px] text-slate-400">{getScoreLabel(metric.score)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                Monthly Comparison
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Track how your financial health changes over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <defs>
                      <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="budgetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="overallGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(value: number, name: string) => [`${value}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                    <Bar dataKey="Spending" fill="url(#spendingGradient)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Savings" fill="url(#savingsGradient)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Budget Adherence" fill="url(#budgetGradient)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Overall" fill="url(#overallGradient)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    Improvement Suggestions
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    {suggestions.length} actionable tips to boost your score
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <AnimatePresence>
                    {suggestions.map((suggestion, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, delay: i * 0.05 }}
                        className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {suggestion.priority === 'high' ? (
                              <AlertTriangle className="h-4 w-4 text-red-400" />
                            ) : suggestion.priority === 'medium' ? (
                              <Lightbulb className="h-4 w-4 text-amber-400" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            )}
                            <p className="text-sm font-semibold text-white">{suggestion.title}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-wider',
                              suggestion.priority === 'high'
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : suggestion.priority === 'medium'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            )}
                          >
                            {suggestion.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400">{suggestion.description}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-400" />
                    Score History
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    {historicalScores.length} months tracked
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                  {historicalScores.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">No scores calculated yet</p>
                  )}
                  {historicalScores.map((score) => (
                    <div
                      key={score.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/30 p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white tabular-nums">
                          {score.overallScore}% - {getScoreLabel(score.overallScore)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {score.month} · Spending: {score.spendingScore}% · Savings: {score.savingsScore}%
                        </p>
                      </div>
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getScoreColor(score.overallScore) }}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Score Guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(['Excellent', 'Good', 'Fair', 'Poor'] as HealthCategory[]).map((category) => (
                    <div key={category} className="flex items-center justify-between rounded-lg bg-slate-800/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: getScoreColor(category === 'Excellent' ? 90 : category === 'Good' ? 70 : category === 'Fair' ? 50 : 25) }}
                        />
                        <span className="text-xs font-medium text-slate-300">{category}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        {category === 'Excellent' ? '80-100' : category === 'Good' ? '60-79' : category === 'Fair' ? '40-59' : '0-39'}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
