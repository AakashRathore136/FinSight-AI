/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Settings2, RotateCcw, TrendingUp, Wallet, History as HistoryIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Switch } from '@/src/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Progress } from '@/src/components/ui/progress';
import { cn, formatCurrency } from '@/src/lib/utils';
import {
  type BudgetCategory,
  type RolloverEntry,
  getCurrentMonthKey,
  getPreviousMonthKey,
  getMonthLabel,
  calculateRolloverAmount,
  calculateUnusedBudget,
  fetchPreviousMonthTransactions,
  fetchBudgetCategories,
  fetchRolloverHistory,
  createBudgetCategory,
  updateBudgetCategory,
  createRolloverEntry,
  resetAllRollovers,
  resetCategoryRollover,
  initializeDefaultCategories,
  getRolloverStats,
} from '@/src/lib/budgetUtils';

interface RolloverManagerProps {
  user: import('firebase/auth').User | null;
}

export function RolloverManager({ user }: RolloverManagerProps) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [history, setHistory] = useState<RolloverEntry[]>([]);
  const [priorMonthSpend, setPriorMonthSpend] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('categories');
  const inFlightRef = useRef(false);

  const currentMonth = getCurrentMonthKey();
  const previousMonth = getPreviousMonthKey();

  useEffect(() => {
    if (!user) {
      setCategories([]);
      setHistory([]);
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      const [cats, hist, transactions] = await Promise.all([
        fetchBudgetCategories(user.uid),
        fetchRolloverHistory(user.uid),
        fetchPreviousMonthTransactions(user.uid),
      ]);
      const spending = transactions.reduce<Record<string, number>>((totals, transaction) => {
        const isExpense = transaction.type === 'expense' || transaction.amount < 0;
        if (isExpense) totals[transaction.category] = (totals[transaction.category] || 0) + Math.abs(transaction.amount);
        return totals;
      }, {});
      if (active) {
        let finalCats = cats;
        if (cats.length === 0) {
          const defaults = initializeDefaultCategories(user.uid);
          for (const cat of defaults) {
            await createBudgetCategory(user.uid, {
              name: cat.name,
              monthlyLimit: 0,
              rolloverEnabled: false,
              rolloverPercentage: 100,
            });
          }
          finalCats = await fetchBudgetCategories(user.uid);
        }
        setCategories(finalCats);
        setHistory(hist);
        setPriorMonthSpend(spending);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user]);

  const totalRolledOver = useMemo(() => {
    return history
      .filter((h) => h.toMonth === currentMonth)
      .reduce((sum, h) => sum + h.amount, 0);
  }, [history, currentMonth]);

  const stats = useMemo(() => getRolloverStats(history), [history]);

  const handleToggleRollover = async (category: BudgetCategory, enabled: boolean) => {
    if (!user) return;
    const ok = await updateBudgetCategory(category.id, { rolloverEnabled: enabled });
    if (ok) {
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, rolloverEnabled: enabled } : c))
      );
      toast.success(`${category.name} rollover ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      toast.error('Failed to update rollover setting');
    }
  };

  const handlePercentageChange = async (category: BudgetCategory, percentage: number) => {
    if (!user) return;
    const clamped = Math.max(0, Math.min(100, percentage));
    const ok = await updateBudgetCategory(category.id, { rolloverPercentage: clamped });
    if (ok) {
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, rolloverPercentage: clamped } : c))
      );
    }
  };

  const handleBudgetLimitChange = async (category: BudgetCategory, limit: number) => {
    if (!user) return;
    const ok = await updateBudgetCategory(category.id, { monthlyLimit: Math.max(0, limit) });
    if (ok) {
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, monthlyLimit: Math.max(0, limit) } : c))
      );
    }
  };

  const handleCreateRollover = async (category: BudgetCategory) => {
    if (!user) return;
    if (!category.rolloverEnabled) {
      toast.error('Enable rollover for this category first');
      return;
    }
    const alreadyRolled = history.some(
      (h) => h.category === category.name && h.toMonth === currentMonth && h.fromMonth === previousMonth
    );
    if (alreadyRolled) {
      toast.info('Already rolled over for this month');
      return;
    }
    const unusedBudget = calculateUnusedBudget(category.monthlyLimit, priorMonthSpend[category.name] || 0);
    if (unusedBudget <= 0) {
      toast.error('No unused budget available to roll over');
      return;
    }
    if (saving || inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    const rolloverAmount = calculateRolloverAmount(unusedBudget, category.rolloverPercentage);
    if (rolloverAmount <= 0) {
      toast.error('Rollover amount is zero');
      inFlightRef.current = false;
      setSaving(false);
      return;
    }
    const ok = await updateBudgetCategory(category.id, { rolledOverAmount: rolloverAmount });
    if (!ok) {
      toast.error('Failed to create rollover entry');
      inFlightRef.current = false;
      setSaving(false);
      return;
    }
    const entry = await createRolloverEntry(
      user.uid,
      previousMonth,
      currentMonth,
      category.name,
      rolloverAmount,
      category.rolloverPercentage
    );
    if (entry) {
      setCategories((prev) => prev.map((c) =>
        c.id === category.id ? { ...c, rolledOverAmount: rolloverAmount } : c
      ));
      setHistory((prev) => [entry, ...prev]);
      toast.success(`Rolled over ${formatCurrency(rolloverAmount)} for ${category.name}`);
    } else {
      toast.error('Failed to create rollover entry');
    }
    inFlightRef.current = false;
    setSaving(false);
  };

  const handleResetAll = async () => {
    if (!user) return;
    const ok = await resetAllRollovers(user.uid);
    if (ok) {
      // Re-fetch the persisted categories instead of swapping in locally-built
      // defaults whose synthetic `<uid>_<name>` IDs don't exist in Firestore —
      // any subsequent updateBudgetCategory call on them would fail.
      setCategories(await fetchBudgetCategories(user.uid));
      toast.success('All rollovers have been reset');
    } else {
      toast.error('Failed to reset rollovers');
    }
  };

  const handleResetCategory = async (categoryId: string) => {
    if (!user) return;
    const ok = await resetCategoryRollover(user.uid, categoryId);
    if (ok) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, rolledOverAmount: 0, rolloverEnabled: false, rolloverPercentage: 100 }
            : c
        )
      );
      toast.success('Category rollover reset');
    } else {
      toast.error('Failed to reset category rollover');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <RefreshCw className="h-7 w-7 text-emerald-400" />
            Budget Rollover
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Carry unused budgets forward month over month
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleResetAll}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl h-9 px-4 text-xs font-semibold uppercase tracking-wider"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Reset All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total Rolled Over"
          value={formatCurrency(totalRolledOver)}
          sub={`${stats.count} transactions`}
          accent="emerald"
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Current Month"
          value={getMonthLabel(currentMonth)}
          sub="Active rollover period"
          accent="indigo"
        />
        <SummaryCard
          icon={<HistoryIcon className="h-5 w-5" />}
          label="Previous Month"
          value={getMonthLabel(previousMonth)}
          sub="Source of unused budget"
          accent="amber"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1">
          <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
            Categories
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
            History
            {history.length > 0 && (
              <Badge variant="outline" className="ml-2 bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-6 space-y-4">
          <AnimatePresence>
            {categories.map((category) => {
              const unusedBudget = calculateUnusedBudget(
                category.monthlyLimit,
                priorMonthSpend[category.name] || 0,
              );
              const rolloverAmount = category.rolloverEnabled
                ? calculateRolloverAmount(unusedBudget, category.rolloverPercentage)
                : 0;
              const rolloverPercentage = category.monthlyLimit > 0 ? (unusedBudget / category.monthlyLimit) * 100 : 0;

              return (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                    <CardContent className="p-5">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-semibold text-sm truncate">{category.name}</h3>
                            {category.rolloverEnabled && (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                                Active
                              </Badge>
                            )}
                            {unusedBudget > 0 && (
                              <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[10px] font-bold uppercase tracking-wider">
                                {formatCurrency(unusedBudget)} unused
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <div className="flex items-center gap-2">
                              <span className="uppercase tracking-wider font-semibold">Budget</span>
                              <Input
                                type="number"
                                value={category.monthlyLimit || ''}
                                onChange={(e) => handleBudgetLimitChange(category, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-24 h-8 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-lg text-xs"
                              />
                            </div>
                            {category.monthlyLimit > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="uppercase tracking-wider font-semibold">Unused</span>
                                <span className="text-slate-300 font-medium tabular-nums">
                                  {rolloverPercentage.toFixed(1)}%
                                </span>
                                <div className="w-24">
                                  <Progress value={Math.min(100, rolloverPercentage)} className="h-1" />
                                </div>
                              </div>
                            )}
                            {category.rolloverEnabled && category.rolledOverAmount > 0 && category.monthlyLimit > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="uppercase tracking-wider font-semibold">Effective Limit</span>
                                <span className="text-emerald-400 font-medium tabular-nums">
                                  {formatCurrency(category.monthlyLimit + category.rolledOverAmount)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rollover %</p>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={category.rolloverPercentage}
                                  onChange={(e) => handlePercentageChange(category, parseInt(e.target.value, 10) || 0)}
                                  disabled={!category.rolloverEnabled}
                                  className="w-16 h-8 bg-slate-800 border-slate-700 text-white rounded-lg text-xs disabled:opacity-50"
                                  min={0}
                                  max={100}
                                />
                                <span className="text-slate-500 text-xs">%</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right min-w-[100px]">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rollover Amount</p>
                            <p className={cn(
                              "text-sm font-bold tabular-nums",
                              rolloverAmount > 0 ? "text-emerald-400" : "text-slate-500"
                            )}>
                              {formatCurrency(rolloverAmount)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={category.rolloverEnabled}
                              onCheckedChange={(checked) => handleToggleRollover(category, checked)}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleResetCategory(category.id)}
                              className="text-slate-500 hover:text-red-400 h-8 w-8"
                              title="Reset rollover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {category.rolloverEnabled && unusedBudget > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                          <div className="text-xs text-slate-500">
                            <span className="text-slate-400">Unused budget:</span> {formatCurrency(unusedBudget)} · <span className="text-slate-400">Rolling over at {category.rolloverPercentage}%</span>
                          </div>
                          <Button
                            onClick={() => handleCreateRollover(category)}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg h-8 px-4"
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Roll Over
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {categories.length === 0 && (
            <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
              <CardContent className="py-16 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <Settings2 className="h-8 w-8 text-slate-500" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">No categories configured</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">
                  Budget categories will be created automatically. Enable rollover to start carrying unused budgets forward.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-indigo-400" />
                <CardTitle className="text-white text-sm">Rollover History</CardTitle>
              </div>
              <CardDescription className="text-slate-500 text-xs">
                Monthly rollover transactions across all categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                    <HistoryIcon className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">No rollover history yet</p>
                  <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
                    Enable rollover on a category and click Roll Over to create your first entry.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                          <RefreshCw className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.category}</p>
                          <p className="text-xs text-slate-500">
                            {getMonthLabel(entry.fromMonth)} → {getMonthLabel(entry.toMonth)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-400 tabular-nums">
                          {formatCurrency(entry.amount)}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          {entry.percentage}% rolled over
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: 'emerald' | 'indigo' | 'amber';
}) {
  const accentMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  }[accent];

  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', accentMap)}>
            {icon}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        </div>
        <p className="text-2xl font-bold text-white mt-3 tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

