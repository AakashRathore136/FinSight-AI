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
import { Progress } from "@/src/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import {
  Wallet,
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
  Calendar,
  Target,
  RefreshCw,
} from "lucide-react";
import { BudgetRecommendations } from "@/src/components/budget/BudgetRecommendations";
import {
  fetchLast3MonthsTransactions,
  fetchPreviousMonthTransactions,
  generateBudgetSuggestions,
  calculateTotalBudget,
  calculateConfidenceScore,
  fetchBudgetFromFirestore,
  saveBudgetToFirestore,
  generateBudgetComparison,
  getCurrentMonthKey,
  CategoryBudgetSuggestion,
  BudgetComparison,
  Transaction,
  formatCurrency,
} from "@/src/lib/budgetUtils";

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export function BudgetDashboard({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<CategoryBudgetSuggestion[]>(
    [],
  );
  const [totalBudget, setTotalBudget] = useState(0);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [comparison, setComparison] = useState<BudgetComparison[]>([]);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = getCurrentMonthKey();

  useEffect(() => {
    loadBudgetData();
  }, [user]);

  async function loadBudgetData() {
    if (!user) return;

    setLoading(true);
    setSaved(false);

    try {
      const [transactions, previousMonthTransactions] = await Promise.all([
        fetchLast3MonthsTransactions(user.uid),
        fetchPreviousMonthTransactions(user.uid),
      ]);

      const previousSpending = previousMonthTransactions.reduce<
        Record<string, number>
      >((acc, t) => {
        if (t.type === "expense") {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
        }
        return acc;
      }, {});

      const generatedSuggestions = await generateBudgetSuggestions(
        transactions,
        previousSpending,
      );
      const confidence = calculateConfidenceScore(
        transactions,
        generatedSuggestions.reduce(
          (acc, s) => {
            acc[s.category] = s.averageSpending;
            return acc;
          },
          {} as Record<string, number>,
        ),
      );

      const savedBudget = await fetchBudgetFromFirestore(
        user.uid,
        currentMonth,
      );

      let finalSuggestions = generatedSuggestions;
      let finalTotal = calculateTotalBudget(generatedSuggestions);
      let finalConfidence = confidence;

      if (savedBudget && savedBudget.categoryBudgets) {
        finalSuggestions = generatedSuggestions.map((s) => {
          const hasSaved = Object.prototype.hasOwnProperty.call(
            savedBudget.categoryBudgets,
            s.category,
          );
          const savedAmount = hasSaved
            ? savedBudget.categoryBudgets[s.category]
            : s.suggestedAmount;
          const savedStatus = savedBudget.categoryStatuses?.[s.category];
          return {
            ...s,
            suggestedAmount: savedAmount,
            modifiedAmount: savedAmount,
            status: savedStatus || (hasSaved ? "accepted" : s.status),
          };
        });
        finalTotal = savedBudget.totalBudget;
        finalConfidence = savedBudget.confidenceScore;
        setSaved(true);
      }

      const budgetComparison = generateBudgetComparison(
        finalSuggestions,
        previousSpending,
      );

      setSuggestions(finalSuggestions);
      setTotalBudget(finalTotal);
      setConfidenceScore(finalConfidence);
      setComparison(budgetComparison);
    } catch (error) {
      console.error("Failed to load budget data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBudget(newSuggestions: CategoryBudgetSuggestion[]) {
    if (!user) return;

    const categoryBudgets: Record<string, number> = {};
    const categoryStatuses: Record<string, string> = {};
    newSuggestions.forEach((s) => {
      const amount =
        s.status === "rejected" ? 0 : (s.modifiedAmount ?? s.suggestedAmount);
      categoryBudgets[s.category] = amount;
      categoryStatuses[s.category] = s.status || "accepted";
    });

    const budgetData = {
      userId: user.uid,
      month: currentMonth,
      totalBudget: calculateTotalBudget(newSuggestions),
      categoryBudgets,
      categoryStatuses,
      confidenceScore,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await saveBudgetToFirestore(user.uid, budgetData);
      setTotalBudget(budgetData.totalBudget);
      setSaved(true);
    } catch (error) {
      console.error("Failed to save budget:", error);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadBudgetData();
    setRefreshing(false);
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getConfidenceBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const previousTotal = comparison.reduce((acc, c) => acc + c.previous, 0);
  const budgetChange = totalBudget - previousTotal;
  const budgetChangePercent =
    previousTotal > 0 ? Math.round((budgetChange / previousTotal) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
              Smart Budget Recommendations
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              AI-powered budgeting based on your spending patterns
            </p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">
              Analyzing spending patterns...
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
            Smart Budget Recommendations
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            AI-powered budgeting based on your last 3 months of spending
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <Badge className="bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-wider border-emerald-500/20">
              Saved for {currentMonth}
            </Badge>
          )}
          <Button
            variant="outline"
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-9 px-3 gap-2 border-slate-700 hidden md:flex"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Export PDF</span>
          </Button>
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
              <div className="h-12 w-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 shadow-inner">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Total Budget
                </p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {formatCurrency(totalBudget)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {budgetChange !== 0 && (
                    <>
                      {budgetChange > 0 ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      )}
                      <span
                        className={`text-xs font-bold ${budgetChange > 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {budgetChange > 0 ? "+" : ""}
                        {formatCurrency(budgetChange)} ({budgetChangePercent}%)
                      </span>
                    </>
                  )}
                  {budgetChange === 0 && (
                    <span className="text-xs font-bold text-slate-500">
                      vs last month
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 shadow-inner">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Confidence Score
                </p>
                <p
                  className={`text-2xl font-black mt-0.5 ${getConfidenceColor(confidenceScore)}`}
                >
                  {confidenceScore}%
                </p>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  {getConfidenceColor(confidenceScore).replace("text-", "")}{" "}
                  confidence
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Progress value={confidenceScore} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-400 shadow-inner">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Categories
                </p>
                <p className="text-2xl font-black text-white mt-0.5">
                  {suggestions.length}
                </p>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  Budget categories tracked
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BudgetRecommendations
            suggestions={suggestions}
            totalBudget={totalBudget}
            confidenceScore={confidenceScore}
            onSave={handleSaveBudget}
            isLoading={loading}
          />
        </div>

        <div className="space-y-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Budget vs Previous Month
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Comparison of suggested budget with last month
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {comparison.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-slate-500">
                  <p className="text-xs font-medium">
                    No comparison data available
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={comparison}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="category"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val.length > 8 ? val.slice(0, 8) + "..." : val
                      }
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
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
                        formatCurrency(value),
                        "Amount",
                      ]}
                    />
                    <Legend />
                    <Bar
                      dataKey="previous"
                      name="Previous Month"
                      fill="#64748b"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="suggested"
                      name="Suggested Budget"
                      radius={[3, 3, 0, 0]}
                    >
                      {comparison.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.difference > 0
                              ? "#6366f1"
                              : entry.difference < 0
                                ? "#ef4444"
                                : "#64748b"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Confidence Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Data Consistency
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidenceScore * 0.4), 40)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidenceScore * 0.4, 40)}
                  className="h-1.5"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Transaction Volume
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidenceScore * 0.35), 35)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidenceScore * 0.35, 35)}
                  className="h-1.5"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Category Diversity
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.min(Math.round(confidenceScore * 0.25), 25)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(confidenceScore * 0.25, 25)}
                  className="h-1.5"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
