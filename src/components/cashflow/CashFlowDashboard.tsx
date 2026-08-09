/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Progress } from "@/src/components/ui/progress";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import {
  Loader2,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import {
  fetchUserTransactions,
  calculateMonthlyForecast,
  calculateBalanceProjection,
  calculateConfidenceScore,
  identifyRecurringTransactions,
  ForecastData,
  BalanceProjection,
  RecurringTransaction,
} from "@/src/lib/cashflowUtils";

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981"];

export function CashFlowDashboard({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [projection, setProjection] = useState<BalanceProjection[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [startingBalance, setStartingBalance] = useState(0);

  useEffect(() => {
    loadCashFlowData();
  }, [user]);

  async function loadCashFlowData() {
    if (!user) return;
    setLoading(true);
    try {
      const stored = Number(localStorage.getItem("finsight_starting_balance") || 0);
      const starting = Number.isFinite(stored) ? stored : 0;
      setStartingBalance(starting);
      const transactions = await fetchUserTransactions(user.uid, 6);
      const forecastData = calculateMonthlyForecast(transactions, 6);
      const balanceProj = calculateBalanceProjection(
        transactions,
        forecastData,
        starting,
      );
      const recurringTx = identifyRecurringTransactions(transactions);
      const confScore = calculateConfidenceScore(transactions, forecastData);

      setForecast(forecastData);
      setProjection(balanceProj);
      setRecurring(recurringTx);
      setConfidence(confScore);
    } catch (error) {
      console.error("Failed to load cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleStartingBalanceChange(value: string) {
    const parsed = Number(value);
    const balance = Number.isFinite(parsed) ? parsed : 0;
    setStartingBalance(balance);
    localStorage.setItem("finsight_starting_balance", String(balance));
    setProjection(calculateBalanceProjection([], forecast, balance));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadCashFlowData();
    setRefreshing(false);
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
              Cash Flow Forecast
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              Projected income, expenses, and balance
            </p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">
              Analyzing cash flow patterns...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
            Cash Flow Forecast
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            6-month projection based on your income and spending trends
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={`${getConfidenceColor(confidence).replace("text-", "bg-")}/10 ${getConfidenceColor(confidence)} text-[9px] font-black uppercase tracking-wider border-${getConfidenceColor(confidence).replace("text-", "")}/20`}
          >
            {confidence}% Confidence
          </Badge>
          <Button
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-9 w-9 p-0"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 shadow-inner">
                <ArrowUpRight className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Avg Monthly Income
                </p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {forecast.length > 0
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(
                        forecast.reduce((a, b) => a + b.projectedIncome, 0) /
                          forecast.length,
                      )
                    : "$0"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-red-600/10 flex items-center justify-center text-red-400 shadow-inner">
                <ArrowDownRight className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Avg Monthly Expenses
                </p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {forecast.length > 0
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(
                        forecast.reduce((a, b) => a + b.projectedExpenses, 0) /
                          forecast.length,
                      )
                    : "$0"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 shadow-inner">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Projected Balance
                </p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {projection.length > 0
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(
                        projection[projection.length - 1]?.projectedBalance ||
                          0,
                      )
                    : "$0"}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                Starting Balance
              </p>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={
                  startingBalance === 0 ? "" : String(startingBalance)
                }
                onChange={(e) => handleStartingBalanceChange(e.target.value)}
                placeholder="Enter your current balance"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Balance Projection
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Projected account balance over the next 6 months
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={projection}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="balanceGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
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
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1219",
                        border: "1px solid #1e293b",
                        borderRadius: "8px",
                      }}
                      itemStyle={{ color: "#f8fafc" }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(value: number) => [
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(value),
                        "Balance",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="projectedBalance"
                      name="Projected Balance"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#balanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Monthly Forecast
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Income vs expenses for the next 6 months
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={forecast}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
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
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1219",
                        border: "1px solid #1e293b",
                        borderRadius: "8px",
                      }}
                      itemStyle={{ color: "#f8fafc" }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(value: number) => [
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(value),
                        "",
                      ]}
                    />
                    <Legend />
                    <Bar
                      dataKey="projectedIncome"
                      name="Income"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="projectedExpenses"
                      name="Expenses"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Recurring Transactions
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Detected recurring income and expenses
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {recurring.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No recurring transactions detected
                </p>
              ) : (
                <div className="space-y-3">
                  {recurring.slice(0, 8).map((tx, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${tx.type === "income" ? "bg-emerald-500" : "bg-red-500"}`}
                        />
                        <span className="text-xs text-slate-300">
                          {tx.category}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold tabular-nums ${tx.type === "income" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {tx.type === "income" ? "+" : "-"}
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(tx.averageAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {confidence > 0 && (
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Forecast Confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Data Consistency
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidence * 0.4), 40)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidence * 0.4, 40)}
                  className="h-1.5"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Transaction Volume
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidence * 0.35), 35)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidence * 0.35, 35)}
                  className="h-1.5"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Trend Stability
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidence * 0.25), 25)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidence * 0.25, 25)}
                  className="h-1.5"
                />
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
