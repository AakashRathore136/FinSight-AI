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
} from "recharts";
import { TrendingUp, Loader2, Download, Filter, Calendar } from "lucide-react";
import PeriodSelector from "@/src/components/trends/PeriodSelector";
import {
  fetchUserTransactions,
  generateMonthlyComparison,
  generateWeeklyComparison,
  generateCategoryDistribution,
  generateTrendLines,
  PeriodType,
  formatCurrency,
} from "@/src/lib/trendsUtils";

const COLORS = [
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

export function CategoryTrends({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("month");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadTrendData();
  }, [user, period]);

  async function loadTrendData() {
    if (!user) return;
    setLoading(true);
    try {
      const transactions = await fetchUserTransactions(user.uid, 6);
      const monthly = generateMonthlyComparison(transactions, period);
      const weekly = generateWeeklyComparison(transactions);
      const pie = generateCategoryDistribution(transactions, period);
      const trends = generateTrendLines(transactions, period);
      const cats = Array.from(
        new Set(transactions.map((t) => t.category)),
      ).sort();
      setMonthlyData(monthly);
      setWeeklyData(weekly);
      setPieData(pie);
      setTrendData(trends);
      setCategories(cats);
    } catch (error) {
      console.error("Failed to load trend data:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    toast.success("Chart export started...");
  };

  const filteredMonthly =
    selectedCategory === "all"
      ? monthlyData
      : monthlyData.map((m) => ({
          ...m,
          [selectedCategory]: m[selectedCategory] || 0,
        }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
              Category Trends
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              Visualize spending patterns over time
            </p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">
              Loading trend data...
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
            Category Trends
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Analyze spending patterns across categories and time periods
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 h-9 px-3 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-9 w-9 p-0"
            onClick={handleExport}
          >
            <Download size={16} />
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
              Monthly Comparison
            </CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Spending per category by month
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filteredMonthly}
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
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1219",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(value: number) => [formatCurrency(value), ""]}
                  />
                  {selectedCategory === "all" ? (
                    categories
                      .slice(0, 6)
                      .map((cat, i) => (
                        <Bar
                          key={cat}
                          dataKey={cat}
                          fill={COLORS[i % COLORS.length]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                  ) : (
                    <Bar
                      dataKey={selectedCategory}
                      fill="#6366f1"
                      radius={[2, 2, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
              Category Distribution
            </CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Spending breakdown by category
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1219",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl lg:col-span-2">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
              Category Trends Over Time
            </CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              6-month spending trends by category
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
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
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1219",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                  {categories.slice(0, 5).map((cat, i) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
