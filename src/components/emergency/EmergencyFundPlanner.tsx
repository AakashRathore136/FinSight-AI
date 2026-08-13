/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  format,
  addMonths,
} from 'date-fns';
import {
  Shield,
  Plus,
  TrendingUp,
  X,
  BarChart3,
  CheckCircle2,
  Trash2,
  Bell,
  BellOff,
  PiggyBank,
  History,
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

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Progress, ProgressTrack, ProgressIndicator } from '@/src/components/ui/progress';
import { cn, formatCurrency, toDate } from '@/src/lib/utils';
import {
  type EmergencyFund,
  type Contribution,
  calculateRecommendedTarget,
  calculateMonthlySavings,
  estimateCompletionDate,
  getProgressPercentage,
  getEmergencyFund,
  createEmergencyFund,
  updateEmergencyFund,
  addContribution,
  isFundComplete,
  DEFAULT_MAX_MONTHS,
} from '@/src/lib/emergencyUtils';

interface EmergencyFundPlannerProps {
  user: import('firebase/auth').User | null;
}

const MONTH_OPTIONS = [3, 4, 5, 6];

export function EmergencyFundPlanner({ user }: EmergencyFundPlannerProps) {
  const [fund, setFund] = useState<EmergencyFund | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);

  const [monthlyExpenses, setMonthlyExpenses] = useState('');
  const [targetMonths, setTargetMonths] = useState(DEFAULT_MAX_MONTHS);
  const [monthlyContribution, setMonthlyContribution] = useState('');

  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeNote, setContributeNote] = useState('');

  const fundRef = useRef<EmergencyFund | null>(null);
  fundRef.current = fund;

  useEffect(() => {
    if (!user) {
      setFund(null);
      setLoading(false);
      return;
    }
    let active = true;
    getEmergencyFund(user.uid).then((f) => {
      if (!active) return;
      setFund(f);
      setLoading(false);
      if (!f) setSetupOpen(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const recommendedTarget = useMemo(() => {
    const parsed = parseFloat(monthlyExpenses);
    return calculateRecommendedTarget(isNaN(parsed) ? 0 : parsed, targetMonths);
  }, [monthlyExpenses, targetMonths]);

  const monthlySuggestion = useMemo(() => {
    if (!fund) return 0;
    const remaining = Math.max(0, fund.targetAmount - fund.currentAmount);
    if (remaining <= 0) return 0;
    return calculateMonthlySavings(fund.targetAmount, fund.currentAmount, fund.monthsCovered || DEFAULT_MAX_MONTHS);
  }, [fund]);

  const completionDate = useMemo(() => {
    if (!fund) return null;
    const contribution = parseFloat(monthlyContribution) || fund.monthlyContribution || 0;
    return estimateCompletionDate(fund.targetAmount, fund.currentAmount, contribution);
  }, [fund, monthlyContribution]);

  const progress = fund ? getProgressPercentage(fund.currentAmount, fund.targetAmount) : 0;

  const projection = useMemo(() => {
    if (!fund) return [];
    const contribution = parseFloat(monthlyContribution) || fund.monthlyContribution || 0;
    if (contribution <= 0) return [];
    const now = new Date();
    const data: { month: string; projected: number }[] = [];
    let running = fund.currentAmount;
    for (let i = 1; i <= 24 && running < fund.targetAmount; i++) {
      running += contribution;
      if (running > fund.targetAmount) running = fund.targetAmount;
      data.push({
        month: format(addMonths(now, i), 'MMM yyyy'),
        projected: Math.round(running),
      });
    }
    return data;
  }, [fund, monthlyContribution]);

  const handleSetup = async () => {
    if (!user) return;
    const targetAmount = recommendedTarget;
    if (targetAmount <= 0) {
      toast.error('Enter your monthly expenses to calculate a target');
      return;
    }
    const monthly = parseFloat(monthlyContribution) || (fund ? fund.monthlyContribution : calculateMonthlySavings(targetAmount, 0, targetMonths));

    if (fund) {
      const ok = await updateEmergencyFund(fund.id, {
        targetAmount,
        currentAmount: fund.currentAmount,
        monthlyContribution: monthly,
        monthsCovered: targetMonths,
        estimatedCompletionDate: estimateCompletionDate(targetAmount, fund.currentAmount, monthly),
      });
      if (ok) {
        setFund({
          ...fund,
          targetAmount,
          monthlyContribution: monthly,
          monthsCovered: targetMonths,
          estimatedCompletionDate: estimateCompletionDate(targetAmount, fund.currentAmount, monthly),
        });
        toast.success('Emergency fund plan updated');
      } else {
        toast.error('Failed to update emergency fund');
      }
    } else {
      const created = await createEmergencyFund({
        userId: user.uid,
        targetAmount,
        currentAmount: 0,
        monthlyContribution: monthly,
        monthsCovered: targetMonths,
        estimatedCompletionDate: estimateCompletionDate(targetAmount, 0, monthly),
        reminderEnabled: false,
        reminderDayOfMonth: 1,
      });
      if (created) {
        setFund(created);
        toast.success('Emergency fund plan created');
      } else {
        toast.error('Failed to create emergency fund');
      }
    }
    setSetupOpen(false);
    setMonthlyExpenses('');
    setMonthlyContribution('');
  };

  const updateGoal = async (patch: Partial<EmergencyFund>) => {
    if (!fund) return;
    const ok = await updateEmergencyFund(fund.id, patch);
    if (ok) setFund({ ...fund, ...patch });
  };

  const handleContribute = async () => {
    if (!fund) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid contribution amount');
      return;
    }
    const updated = await addContribution(fund, amount, contributeNote);
    if (updated) {
      setFund(updated);
      toast.success(`Added ${formatCurrency(amount)} to your fund`);
      setContributeAmount('');
      setContributeNote('');
    } else {
      toast.error('Failed to record contribution');
    }
  };

  const handleAdjustTarget = async () => {
    if (!fund) return;
    const targetAmount = fund.targetAmount;
    const months = targetMonths || fund.monthsCovered;
    const newContribution = calculateMonthlySavings(targetAmount, fund.currentAmount, months);
    await updateGoal({
      targetAmount,
      monthsCovered: months,
      monthlyContribution: newContribution,
      estimatedCompletionDate: estimateCompletionDate(targetAmount, fund.currentAmount, newContribution),
    });
    toast.success('Goal updated');
  };

  const toggleReminder = async () => {
    if (!fund) return;
    const next = !fund.reminderEnabled;
    await updateGoal({ reminderEnabled: next });
    toast.success(next ? 'Monthly reminders enabled' : 'Monthly reminders disabled');
  };

  const handleDeleteContribution = async (contribution: Contribution) => {
    if (!fund) return;
    const contributions = fund.contributions.filter((c) => c.id !== contribution.id);
    const currentAmount = Math.max(0, fund.currentAmount - contribution.amount);
    await updateGoal({
      contributions,
      currentAmount,
      estimatedCompletionDate: estimateCompletionDate(
        fund.targetAmount,
        currentAmount,
        fund.monthlyContribution
      ),
    });
    toast.success('Contribution removed');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Shield className="h-7 w-7 text-emerald-400" />
            Emergency Fund
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Build a safety net to protect against the unexpected
          </p>
        </div>
        {fund && (
          <Button
            onClick={() => setSetupOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-lg shadow-emerald-900/20 rounded-xl h-10 px-4"
          >
            <Plus className="mr-2 h-4 w-4" />
            Adjust Plan
          </Button>
        )}
      </div>

      <AnimatePresence>
        {setupOpen && (
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
                    <CardTitle className="text-white text-lg">
                      {fund ? 'Adjust Your Plan' : 'Build Your Emergency Fund'}
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-1">
                      We calculate your target from your monthly expenses
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSetupOpen(false)}
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
                      Monthly Expenses
                    </label>
                    <Input
                      type="number"
                      value={monthlyExpenses}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMonthlyExpenses(val === '' ? '' : val);
                      }}
                      onBlur={() => {
                        if (!monthlyExpenses) setMonthlyExpenses('0');
                      }}
                      placeholder="0.00"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Months of Coverage
                    </label>
                    <select
                      value={targetMonths}
                      onChange={(e) => setTargetMonths(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer appearance-none text-sm"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m} months
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Recommended Target
                    </label>
                    <div className="h-12 flex items-center justify-between px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-emerald-300 font-semibold text-lg tabular-nums">
                        {formatCurrency(recommendedTarget)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">
                        {targetMonths} × expenses
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Monthly Contribution
                    </label>
                    <Input
                      type="number"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(e.target.value)}
                      placeholder={String(Math.ceil(recommendedTarget / targetMonths))}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Est. Completion
                    </label>
                    <div className="h-10 flex items-center px-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
                      {completionDate ? format(new Date(completionDate), 'MMM d, yyyy') : '—'}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  {fund && (
                    <Button
                      variant="ghost"
                      onClick={() => setSetupOpen(false)}
                      className="text-slate-400 hover:text-slate-300 rounded-lg h-9 px-4 text-sm"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleSetup}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg h-9 px-6 text-sm"
                  >
                    {fund ? 'Save Changes' : 'Create Plan'}
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
      ) : !fund ? (
        <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">No emergency fund yet</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Set a target based on your monthly expenses and start building your financial safety net.
            </p>
            <Button
              onClick={() => setSetupOpen(true)}
              className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl h-10 px-6"
            >
              <Plus className="mr-2 h-4 w-4" />
              Start Planning
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="flex items-center justify-center">
                  <CircularProgress value={progress} />
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Current Balance</p>
                      <p className="text-2xl font-bold text-white tabular-nums">
                        {formatCurrency(fund.currentAmount)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase tracking-wider',
                        progress >= 100
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      )}
                    >
                      {progress >= 100 ? 'Funded' : `${progress}% Funded`}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress to {formatCurrency(fund.targetAmount)}</span>
                      <span className="tabular-nums">
                        {formatCurrency(Math.max(0, fund.targetAmount - fund.currentAmount))} to go
                      </span>
                    </div>
                    <Progress value={progress}>
                      <ProgressTrack>
                        <ProgressIndicator
                          className={cn('h-full transition-all', progress >= 100 ? 'bg-emerald-500' : 'bg-emerald-500')}
                          style={{ width: `${progress}%` }}
                        />
                      </ProgressTrack>
                    </Progress>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Monthly Save" value={formatCurrency(monthlySuggestion || fund.monthlyContribution)} />
                    <Stat label="Months Covered" value={String(fund.monthsCovered)} />
                    <Stat
                      label="Est. Completion"
                      value={fund.estimatedCompletionDate ? format(new Date(fund.estimatedCompletionDate), 'MMM yyyy') : '—'}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Add a Contribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2 sm:col-span-1">
                      <Input
                        type="number"
                        value={contributeAmount}
                        onChange={(e) => setContributeAmount(e.target.value)}
                        placeholder="Amount"
                        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Input
                        value={contributeNote}
                        onChange={(e) => setContributeNote(e.target.value)}
                        placeholder="Note (optional)"
                        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleContribute}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg h-10 text-sm"
                  >
                    <PiggyBank className="mr-2 h-4 w-4" />
                    Record Contribution
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" />
                    Projection
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    Balance growth at {formatCurrency(parseFloat(monthlyContribution) || fund.monthlyContribution)}/month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projection}>
                        <defs>
                          <linearGradient id="efGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: '#94a3b8' }}
                          formatter={(value: number) => [formatCurrency(value), 'Projected']}
                        />
                        <Area type="monotone" dataKey="projected" stroke="#10b981" strokeWidth={2} fill="url(#efGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      {fund.reminderEnabled ? (
                        <Bell className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <BellOff className="h-4 w-4 text-slate-500" />
                      )}
                      Reminders
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleReminder}
                      className="h-7 text-xs rounded-lg border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {fund.reminderEnabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">
                    {fund.reminderEnabled
                      ? `Monthly contribution reminders are on (day ${fund.reminderDayOfMonth} of each month).`
                      : 'Turn on reminders to get notified about your monthly contribution.'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <History className="h-4 w-4 text-emerald-400" />
                    Contributions
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    {fund.contributions.length} logged
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                  {fund.contributions.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">No contributions yet</p>
                  )}
                  {fund.contributions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/30 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white tabular-nums">
                          {formatCurrency(c.amount)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {format(toDate(c.date) || new Date(), 'MMM d, yyyy')}
                          {c.note ? ` · ${c.note}` : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteContribution(c)}
                        className="text-slate-500 hover:text-red-400 h-7 w-7"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {isFundComplete(fund) && (
            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-lg rounded-2xl">
              <CardContent className="py-6 flex items-center gap-3 justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                <p className="text-emerald-300 font-semibold">
                  Your emergency fund is fully funded! 🎉
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function CircularProgress({ value }: { value: number }) {
  const size = 160;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1e293b"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#10b981"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white tabular-nums">{clamped}%</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Funded</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white font-semibold text-sm tabular-nums truncate">{value}</p>
    </div>
  );
}
