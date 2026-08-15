/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from 'react';
import {
  format,
  subMonths,
  parseISO,
} from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  BarChart3,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Input } from '@/src/components/ui/input';
import { cn, formatCurrency } from '@/src/lib/utils';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  type MonthlyForecast,
  type QuarterlyForecast,
  type ForecastFilter,
  generateMonthlyForecast,
  generateQuarterlyForecast,
  applyFilters,
  exportForecastChart,
  calculateTrend,
  getForecasts,
  createForecast,
  updateForecast,
  aggregateTransactionsByMonth,
} from '@/src/lib/forecastUtils';
import { fetchTransactions } from '@/src/lib/anomalyUtils';

interface ForecastComparisonProps {
  user: import('firebase/auth').User | null;
}

async function buildForecastFromTransactions(
  userId: string,
  monthsAhead = 12
): Promise<MonthlyForecast[]> {
  const txns = await fetchTransactions(userId, 12);
  const historicalData = aggregateTransactionsByMonth(txns);
  return generateMonthlyForecast(historicalData, monthsAhead);
}

async function persistGeneratedForecasts(
  userId: string,
  generated: MonthlyForecast[]
): Promise<void> {
  if (!generated.length) return;
  const existing = await getForecasts(userId);
  const byMonth = new Map(existing.map((f) => [f.month, f]));
  for (const m of generated) {
    const payload = {
      month: m.month,
      projectedIncome: m.income,
      projectedExpenses: m.expenses,
      netBalance: m.net,
      confidence: m.confidence,
    };
    const match = byMonth.get(m.month);
    if (match) {
      await updateForecast(match.id, payload);
    } else {
      await createForecast(userId, payload);
    }
  }
}

export function ForecastComparison({ user }: ForecastComparisonProps) {
  const [monthly, setMonthly] = useState<MonthlyForecast[]>([]);
  const [quarterly, setQuarterly] = useState<QuarterlyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'monthly' | 'quarterly'>('monthly');
  const [filter, setFilter] = useState<ForecastFilter>({
    startDate: format(subMonths(new Date(), 5), 'yyyy-MM'),
    endDate: format(new Date(), 'yyyy-MM'),
  });

  useEffect(() => {
    if (!user) {
      setMonthly([]);
      setQuarterly([]);
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const existing = await getForecasts(user.uid);
        if (existing.length > 0 && active) {
          const mapped: MonthlyForecast[] = existing
            .map((f) => ({
              month: f.month,
              income: f.projectedIncome,
              expenses: f.projectedExpenses,
              net: f.netBalance,
              confidence: f.confidence,
            }))
            .sort((a, b) => a.month.localeCompare(b.month));
          setMonthly(mapped);
          setQuarterly(generateQuarterlyForecast(mapped));
        } else if (active) {
          const generated = await buildForecastFromTransactions(user.uid, 12);
          if (!active) return;
          setMonthly(generated);
          setQuarterly(generateQuarterlyForecast(generated));
          if (generated.length === 0) {
            toast.error('Not enough transaction history to generate a forecast');
            return;
          }
          await persistGeneratedForecasts(user.uid, generated);
        }
      } catch (error) {
        console.error('Error loading forecasts:', error);
        handleFirestoreError(error, OperationType.LIST, 'forecasts');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (monthly.length === 0) return;
    const months = monthly.map((forecast) => forecast.month).sort();
    setFilter({ startDate: months[0], endDate: months[months.length - 1] });
  }, [monthly]);

  const filteredMonthly = useMemo(
    () => applyFilters(monthly, filter),
    [monthly, filter]
  );

  const filteredQuarterly = useMemo(
    () => applyFilters(quarterly, filter),
    [quarterly, filter]
  );

  const netTrend = useMemo(() => {
    const values = filteredMonthly.map((m) => ({ month: m.month, value: m.net }));
    return calculateTrend(values);
  }, [filteredMonthly]);

  const totalProjectedIncome = useMemo(
    () =>
      (activeView === "monthly"
        ? filteredMonthly
        : filteredQuarterly.map((q) => ({ ...q, month: q.quarter }))
      ).reduce((s, m) => s + m.income, 0),
    [activeView, filteredMonthly, filteredQuarterly]
  );

  const totalProjectedExpenses = useMemo(
    () =>
      (activeView === "monthly"
        ? filteredMonthly
        : filteredQuarterly.map((q) => ({ ...q, month: q.quarter }))
      ).reduce((s, m) => s + m.expenses, 0),
    [activeView, filteredMonthly, filteredQuarterly]
  );

  const totalNet = useMemo(
    () =>
      (activeView === "monthly"
        ? filteredMonthly
        : filteredQuarterly.map((q) => ({ ...q, month: q.quarter }))
      ).reduce((s, m) => s + m.net, 0),
    [activeView, filteredMonthly, filteredQuarterly]
  );

  const handleExport = () => {
    const data = activeView === 'monthly'
      ? filteredMonthly.map((m) => ({
          period: m.month,
          income: m.income,
          expenses: m.expenses,
          net: m.net,
          confidence: m.confidence,
        }))
      : filteredQuarterly.map((q) => ({
          period: q.quarter,
          income: q.income,
          expenses: q.expenses,
          net: q.net,
          confidence: q.confidence,
        }));
    const csv = exportForecastChart(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forecast-${activeView}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Forecast exported');
  };

  const handleRegenerate = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const generated = await buildForecastFromTransactions(user.uid, 12);
      if (generated.length === 0) {
        setMonthly([]);
        setQuarterly([]);
        toast.error('Not enough transaction history to generate a forecast');
        return;
      }
      setMonthly(generated);
      setQuarterly(generateQuarterlyForecast(generated));
      await persistGeneratedForecasts(user.uid, generated);
      toast.success('Forecast regenerated');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'forecasts');
      toast.error('Failed to regenerate forecast');
    } finally {
      setSaving(false);
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

  const currentData = activeView === 'monthly'
    ? filteredMonthly
    : filteredQuarterly.map((q) => ({
        month: q.quarter,
        income: q.income,
        expenses: q.expenses,
        net: q.net,
        confidence: q.confidence,
      }));

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Income vs Expense Forecast</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Projected financial comparison for planning ahead
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl h-9 px-4 text-xs font-semibold uppercase tracking-wider"
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            onClick={handleRegenerate}
            disabled={saving || !user}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl h-9 px-4"
          >
            {saving ? <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Regenerate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Projected Income"
          value={formatCurrency(totalProjectedIncome)}
          sub={`${filteredMonthly.length} periods`}
          accent="emerald"
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Projected Expenses"
          value={formatCurrency(totalProjectedExpenses)}
          sub={`${filteredMonthly.length} periods`}
          accent="red"
        />
        <SummaryCard
          icon={netTrend === 'up' ? <TrendingUp className="h-5 w-5" /> : netTrend === 'down' ? <TrendingDown className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}
          label="Net Balance"
          value={formatCurrency(totalNet)}
          sub={netTrend === 'up' ? 'Trending up' : netTrend === 'down' ? 'Trending down' : 'Stable'}
          accent={netTrend === 'up' ? 'emerald' : netTrend === 'down' ? 'red' : 'amber'}
        />
      </div>

      <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                Forecast Comparison
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Income vs expenses over time
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <Input
                type="month"
                value={filter.startDate}
                onChange={(e) => setFilter((f) => ({ ...f, startDate: e.target.value }))}
                className="w-36 h-8 bg-slate-800 border-slate-700 text-white rounded-lg text-xs"
              />
              <span className="text-slate-500 text-xs">to</span>
              <Input
                type="month"
                value={filter.endDate}
                onChange={(e) => setFilter((f) => ({ ...f, endDate: e.target.value }))}
                className="w-36 h-8 bg-slate-800 border-slate-700 text-white rounded-lg text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'monthly' | 'quarterly')} className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6">
              <TabsTrigger value="monthly" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Calendar className="mr-2 h-4 w-4" /> Monthly
              </TabsTrigger>
              <TabsTrigger value="quarterly" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <BarChart3 className="mr-2 h-4 w-4" /> Quarterly
              </TabsTrigger>
            </TabsList>

            <TabsContent value="monthly">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickFormatter={(v) => format(parseISO(`${v}-01`), 'MMM yyyy')} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      labelStyle={{ color: '#f8fafc' }}
                      formatter={(value: number) => [formatCurrency(value), '']}
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="quarterly">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredQuarterly.map((q) => ({ month: q.quarter, income: q.income, expenses: q.expenses, net: q.net, confidence: q.confidence }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      labelStyle={{ color: '#f8fafc' }}
                      formatter={(value: number) => [formatCurrency(value), '']}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="income" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Income" />
                    <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Expenses" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64">
              <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Net Balance Trend</h3>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={filteredMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickFormatter={(v) => format(parseISO(`${v}-01`), 'MMM yy')} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                    labelStyle={{ color: '#f8fafc' }}
                    formatter={(value: number) => [formatCurrency(value), 'Net']}
                  />
                  <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} name="Net Balance" />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Confidence Levels</h3>
              <div className="space-y-3">
                {currentData.slice(0, 6).map((d, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <span className="text-sm text-slate-300 truncate w-24">{d.month}</span>
                    <div className="flex-1 mx-4">
                      <div className="w-full bg-slate-800 rounded-full h-1.5">
                        <div
                          className={cn(
                            'h-1.5 rounded-full',
                            d.confidence >= 70 ? 'bg-emerald-500' : d.confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          )}
                          style={{ width: `${d.confidence}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 w-10 text-right">{d.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
  accent: 'emerald' | 'red' | 'amber' | 'indigo';
}) {
  const accentMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
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
