/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InsightsDashboard — AI-Powered Spending Insights.
 *
 * Sections:
 *  - Weekly insights (top categories this week vs last week)
 *  - Monthly summary (total spent, top categories, vs previous month)
 *  - Spending anomalies (unusual transactions flagged)
 *  - Savings opportunities
 *  - Category trends over time (Recharts line chart)
 *  - Plain-language explanations throughout
 */

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Sparkles,
  Lightbulb,
  AlertTriangle,
  PiggyBank,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Loader2,
  Wallet,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  buildInsights,
  fetchTransactions,
  formatCurrency,
  generatePlainSummary,
  type InsightsBundle,
} from "@/src/lib/insightsUtils";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { InsightCard, CategoryDeltaRow } from "./InsightCard";

const LINE_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"];

interface InsightsDashboardProps {
  user: { uid: string } | null;
}

export function InsightsDashboard({ user }: InsightsDashboardProps) {
  const [bundle, setBundle] = useState<InsightsBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Derive loading state - no synchronous setState needed
  const loading = !user || isLoading;

  useEffect(() => {
    if (!user) {
      setBundle(null);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    fetchTransactions(user.uid)
      .then(transactions => {
        if (cancelled) return;
        setBundle(buildInsights(transactions, user.uid));
        setIsLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        handleFirestoreError(error, OperationType.LIST, "transactions");
        setBundle(buildInsights([], user.uid));
        setIsLoading(false);
        setHasError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-indigo-400">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <span className="text-sm font-bold uppercase tracking-wider text-indigo-300">
          Analyzing your spending
        </span>
      </div>
    );
  }

  const hasData = (bundle?.transactionCount ?? 0) > 0;

  return (
    <div className="space-y-8 pb-12">
      <Header />

      {!hasData ? (
        <EmptyState />
      ) : (
        bundle && (
          <>
            <WeeklySection bundle={bundle} />
            <MonthlySection bundle={bundle} />
            <TrendsSection bundle={bundle} />
            <AnomaliesSection bundle={bundle} />
            <OpportunitiesSection bundle={bundle} />
          </>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-white leading-none mb-1">
          <Sparkles className="text-indigo-400" size={26} />
          Spending Insights
        </h1>
        <p className="text-slate-500 text-sm">
          AI-generated analysis of your spending patterns, anomalies, and
          savings opportunities.
        </p>
      </div>
      <div className="text-xs font-mono text-slate-500 uppercase">
        AI Engine Active{" "}
        <span className="inline-block w-2 h-2 ml-2 bg-emerald-500 rounded-full animate-pulse" />
      </div>
    </section>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="text-indigo-400">{icon}</span>
      <div>
        <h2 className="text-lg font-bold text-white leading-none">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

function WeeklySection({ bundle }: { bundle: InsightsBundle }) {
  const { weeklySummary, weekly } = bundle;
  const summary = generatePlainSummary(weeklySummary);
  const topDeltas = weekly.slice(0, 6);

  return (
    <section>
      <SectionHeading
        icon={<CalendarDays size={20} />}
        title="Weekly Insights"
        subtitle="Top spending categories this week vs last week"
      />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800 p-5 lg:col-span-1 flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            This Week
          </span>
          <span className="mt-1 text-3xl font-black text-white tabular-nums">
            {formatCurrency(weeklySummary.total)}
          </span>
          <ChangePill
            changePct={weeklySummary.changePct}
            previous={weeklySummary.previousTotal}
          />
          <p className="mt-4 text-xs leading-relaxed text-slate-400 flex-1">
            {summary}
          </p>
        </Card>

        <Card className="bg-slate-900 border-slate-800 p-5 lg:col-span-2">
          <CardHeader className="p-0 pb-3 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
              Category Movement (WoW)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {topDeltas.length === 0 ? (
              <p className="py-6 text-center text-xs italic text-slate-500">
                No spending recorded this week.
              </p>
            ) : (
              topDeltas.map((d) => (
                <CategoryDeltaRow
                  key={d.category}
                  category={d.category}
                  current={d.current}
                  changePct={d.changePct}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Monthly
// ---------------------------------------------------------------------------

function MonthlySection({ bundle }: { bundle: InsightsBundle }) {
  const { monthlySummary } = bundle;
  const summary = generatePlainSummary(monthlySummary);

  return (
    <section>
      <SectionHeading
        icon={<CalendarRange size={20} />}
        title="Monthly Summary"
        subtitle="Total spent, top categories, and change vs the previous month"
      />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Total Spent This Month
            </span>
            <span className="mt-1 block text-3xl font-black text-white tabular-nums">
              {formatCurrency(monthlySummary.total)}
            </span>
            <ChangePill
              changePct={monthlySummary.changePct}
              previous={monthlySummary.previousTotal}
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Wallet size={14} />
            {monthlySummary.transactionCount} transactions
          </div>
        </Card>

        <Card className="bg-slate-900 border-slate-800 p-5 lg:col-span-2">
          <CardHeader className="p-0 pb-3 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
              Top Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3 space-y-3">
            {monthlySummary.topCategories.length === 0 ? (
              <p className="py-6 text-center text-xs italic text-slate-500">
                No spending recorded this month.
              </p>
            ) : (
              monthlySummary.topCategories.map((cat) => {
                const share =
                  monthlySummary.total > 0
                    ? Math.round((cat.total / monthlySummary.total) * 100)
                    : 0;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">
                        {cat.category}
                      </span>
                      <span className="text-sm font-semibold text-white tabular-nums">
                        {formatCurrency(cat.total)}{" "}
                        <span className="text-xs text-slate-500">
                          ({share}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400 bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex gap-2">
        <Lightbulb size={16} className="text-amber-300 shrink-0 mt-0.5" />
        {summary}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trends chart
// ---------------------------------------------------------------------------

function TrendsSection({ bundle }: { bundle: InsightsBundle }) {
  const { trends, trendCategories } = bundle;

  const hasTrend = useMemo(
    () => trends.length > 0 && trendCategories.length > 0,
    [trends, trendCategories],
  );

  return (
    <section>
      <SectionHeading
        icon={<TrendingUp size={20} />}
        title="Category Trends Over Time"
        subtitle="How your top spending categories have moved over the last 6 months"
      />
      <Card className="bg-slate-900 border-slate-800 p-5">
        <div className="h-[340px]">
          {!hasTrend ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <TrendingUp className="mb-3 h-8 w-8 opacity-30 text-indigo-400" />
              <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Not enough history yet
              </span>
              <span className="mt-1 text-xs opacity-60">
                Trends appear once you have spending across multiple months.
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trends}
                margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="period"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tickFormatter={(v) => formatCurrency(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f1219",
                    border: "1px solid #1e293b",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "#f8fafc" }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(value) => formatCurrency(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                {trendCategories.map((category, i) => (
                  <Line
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

function AnomaliesSection({ bundle }: { bundle: InsightsBundle }) {
  const anomalies = bundle.anomalies.slice(0, 6);
  return (
    <section>
      <SectionHeading
        icon={<AlertTriangle size={20} />}
        title="Spending Anomalies"
        subtitle="Transactions more than 2x your typical category spend"
      />
      {anomalies.length === 0 ? (
        <NoneCard message="No unusual transactions detected. Your spending looks consistent." />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {anomalies.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

function OpportunitiesSection({ bundle }: { bundle: InsightsBundle }) {
  const opportunities = bundle.opportunities.slice(0, 6);
  return (
    <section>
      <SectionHeading
        icon={<PiggyBank size={20} />}
        title="Savings Opportunities"
        subtitle="Subscriptions, dormant categories, and small purchases that add up"
      />
      {opportunities.length === 0 ? (
        <NoneCard message="No obvious savings opportunities found right now. Nicely optimized!" />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {opportunities.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function ChangePill({
  changePct,
  previous,
}: {
  changePct: number | null;
  previous: number;
}) {
  if (changePct === null) {
    return (
      <span className="mt-2 inline-block text-xs font-medium text-slate-500">
        {previous === 0 ? "No prior period to compare" : ""}
      </span>
    );
  }
  const up = changePct >= 0;
  return (
    <span
      className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${
        up ? "text-amber-300" : "text-emerald-300"
      }`}
    >
      <TrendingUp size={13} className={up ? "" : "rotate-180"} />
      {up ? "+" : ""}
      {Math.round(changePct)}% vs previous
    </span>
  );
}

function NoneCard({ message }: { message: string }) {
  return (
    <Card className="bg-slate-900 border-slate-800 border-dashed p-6">
      <div className="flex items-center gap-3 text-slate-400">
        <Sparkles size={18} className="text-emerald-300" />
        <span className="text-sm">{message}</span>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="bg-slate-900 border-slate-800 border-dashed p-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 mb-4">
          <Sparkles size={30} />
        </div>
        <h3 className="text-lg font-bold text-white">
          No transactions to analyze yet
        </h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Once transactions are added to your account, FinSight AI will surface
          weekly and monthly summaries, flag unusual charges, and identify
          savings opportunities here automatically.
        </p>
      </div>
    </Card>
  );
}
