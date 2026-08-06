/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { PeriodSelector } from './PeriodSelector';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Download, Loader2, TrendingUp, Filter, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  buildPeriodConfig,
  calculateCategoryDistribution,
  fetchTransactionsForPeriod,
  generateMonthlyComparison,
  generateTrendLines,
  generateWeeklyComparison,
  getCategoryColor,
  getUniqueCategories,
  saveTrendAnalysis,
  type Transaction,
  type TrendPeriod,
} from '@/src/lib/trendsUtils';

interface CategoryTrendsProps {
  user: { uid: string } | null;
}

const CHART_BG = '#0a0c10';

const tooltipStyle = {
  backgroundColor: '#0f1219',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  color: '#f8fafc',
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 min-h-[300px] bg-slate-900/40 rounded-xl border border-dashed border-slate-800 p-6 text-center">
      <AlertTriangle className="h-8 w-8 mb-3 opacity-30 text-indigo-400" />
      <span className="text-sm font-bold tracking-wider uppercase text-slate-300">{message}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-indigo-400 min-h-[300px]">
      <Loader2 className="h-8 w-8 mb-2 animate-spin" />
      <span className="text-sm font-bold tracking-wider uppercase text-indigo-300">Compiling Trends</span>
    </div>
  );
}

function ChartFrame({ title, chartRef, children }: { title: string; chartRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
      <CardHeader className="p-5 border-b border-slate-800 pb-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div ref={chartRef} style={{ background: CHART_BG }} className="rounded-xl p-2">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export function CategoryTrends({ user }: CategoryTrendsProps) {
  const [period, setPeriod] = useState<TrendPeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('monthly');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const monthlyRef = useRef<HTMLDivElement>(null);
  const weeklyRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);

  const config = useMemo(
    () =>
      buildPeriodConfig(
        period,
        new Date(),
        customStart ? new Date(customStart) : undefined,
        customEnd ? new Date(customEnd) : undefined,
      ),
    [period, customStart, customEnd],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchTransactionsForPeriod(user.uid, config)
      .then((txns) => {
        if (!cancelled) setTransactions(txns);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, config]);

  const categories = useMemo(() => getUniqueCategories(transactions), [transactions]);

  const monthlyData = useMemo(() => generateMonthlyComparison(transactions, 2), [transactions]);
  const weeklyData = useMemo(() => generateWeeklyComparison(transactions, 4), [transactions]);
  const pieData = useMemo(
    () => calculateCategoryDistribution(transactions, categoryFilter === 'all' ? undefined : categoryFilter),
    [transactions, categoryFilter],
  );
  const trendData = useMemo(
    () => generateTrendLines(transactions, 6, new Date(), categoryFilter === 'all' ? undefined : categoryFilter),
    [transactions, categoryFilter],
  );

  const totalSpent = useMemo(
    () => Math.round(pieData.reduce((s, d) => s + d.value, 0) * 100) / 100,
    [pieData],
  );

  const exportChart = async (ref: React.RefObject<HTMLDivElement | null>, name: string) => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, { backgroundColor: CHART_BG, scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, (pageHeight - imgHeight) / 2, imgWidth, imgHeight);
      pdf.save(`finsight-${name}.pdf`);
      toast.success(`Exported ${name} chart`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export chart');
    }
  };

  const exportAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await saveTrendAnalysis(user.uid, config, transactions);
      const refs = [monthlyRef, weeklyRef, pieRef, trendRef];
      for (const ref of refs) {
        if (ref.current) {
          // sequential capture to avoid memory pressure
          // eslint-disable-next-line no-await-in-loop
          const canvas = await html2canvas(ref.current, { backgroundColor: CHART_BG, scale: 2 });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, (pageHeight - imgHeight) / 2, imgWidth, imgHeight);
          pdf.save(`finsight-trend-${ref.current.getAttribute('data-tab') || 'chart'}.pdf`);
        }
      }
      toast.success('Trend analysis saved & exported');
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const monthKeys = monthlyData.periods.map((p) => p.key);
  const weekKeys = weeklyData.periods.map((p) => p.key);
  const trendCategories = useMemo(() => {
    const set = new Set<string>();
    trendData.forEach((p) => Object.keys(p).forEach((k) => k !== 'period' && set.add(k)));
    return Array.from(set);
  }, [trendData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="text-indigo-400" size={24} />
            Expense Category Trends
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {config.label} · {transactions.length} transactions · ₹{totalSpent.toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-300 h-10 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button
            onClick={exportAll}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-900/20 h-10"
          >
            <Download className="mr-2" size={16} />
            Export
          </Button>
        </div>
      </div>

      <PeriodSelector
        value={period}
        onChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomChange={(s, e) => {
          setCustomStart(s);
          setCustomEnd(e);
        }}
      />

      {categoryFilter !== 'all' && (
        <Badge variant="secondary" className="bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
          <Filter size={12} className="mr-1" /> Filtered: {categoryFilter}
        </Badge>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl w-full sm:w-auto inline-flex">
          <TabsTrigger value="monthly" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold uppercase tracking-wider rounded-lg px-4">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="weekly" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold uppercase tracking-wider rounded-lg px-4">
            Weekly
          </TabsTrigger>
          <TabsTrigger value="distribution" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold uppercase tracking-wider rounded-lg px-4">
            Distribution
          </TabsTrigger>
          <TabsTrigger value="trend" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold uppercase tracking-wider rounded-lg px-4">
            Trend
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-6">
          <ChartFrame title="Monthly Category Comparison" chartRef={monthlyRef}>
            {loading ? (
              <LoadingState />
            ) : monthlyData.data.length === 0 ? (
              <EmptyState message="No transactions this period" />
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={monthlyData.data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {monthKeys.map((k, idx) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      name={monthlyData.periods[idx].label}
                      fill={idx === 0 ? '#6366f1' : '#8b5cf6'}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => exportChart(monthlyRef, 'monthly')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Download size={14} className="mr-2" /> Export Monthly
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <ChartFrame title="Weekly Category Comparison" chartRef={weeklyRef}>
            {loading ? (
              <LoadingState />
            ) : weeklyData.data.length === 0 ? (
              <EmptyState message="No transactions this period" />
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={weeklyData.data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {weekKeys.map((k, idx) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      name={weeklyData.periods[idx].label}
                      fill={['#ec4899', '#f59e0b', '#10b981', '#06b6d4'][idx % 4]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => exportChart(weeklyRef, 'weekly')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Download size={14} className="mr-2" /> Export Weekly
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ChartFrame title="Category Distribution" chartRef={pieRef}>
                {loading ? (
                  <LoadingState />
                ) : pieData.length === 0 ? (
                  <EmptyState message="No distribution data" />
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={130}
                        paddingAngle={2}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color || getCategoryColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [`₹${v.toLocaleString()}`, n]} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartFrame>
            </div>
            <div className="space-y-3">
              <Card className="bg-slate-900 border-slate-800 rounded-2xl">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">Breakdown</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Share of total spend</CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-3 max-h-[360px] overflow-y-auto">
                  {pieData.map((d) => {
                    const pct = totalSpent > 0 ? Math.round((d.value / totalSpent) * 100) : 0;
                    return (
                      <div key={d.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-300">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color || getCategoryColor(d.name) }} />
                            {d.name}
                          </span>
                          <span className="font-mono text-slate-400">₹{d.value.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color || getCategoryColor(d.name) }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => exportChart(pieRef, 'distribution')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Download size={14} className="mr-2" /> Export Distribution
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="trend" className="mt-6">
          <ChartFrame title="Category Spend Trend (Last 6 Months)" chartRef={trendRef}>
            {loading ? (
              <LoadingState />
            ) : trendData.length === 0 ? (
              <EmptyState message="No trend data" />
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {trendCategories.map((cat) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stroke={getCategoryColor(cat)}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => exportChart(trendRef, 'trend')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Download size={14} className="mr-2" /> Export Trend
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
