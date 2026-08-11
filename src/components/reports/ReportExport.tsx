/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { toast } from "sonner";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  FileText,
  Download,
  Calendar,
  RefreshCw,
  PieChart as PieChartIcon,
  BarChart3,
  Filter,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  endOfDay,
} from "date-fns";
import { format, subDays, startOfMonth, endOfMonth, endOfDay } from "date-fns";
import {
  fetchTransactionsForDateRange,
  generateExpenseSummary,
  generateIncomeSummary,
  buildReportData,
  downloadCSV,
  generatePDF,
  saveReportToFirestore,
  type ReportTransaction,
  type ExpenseSummaryItem,
  type IncomeSummaryItem,
  type ReportData,
} from "@/src/lib/reportUtils";
import { formatCurrency } from "@/src/lib/utils";
import { ReportPreview } from "@/src/components/reports/ReportPreview";
import {
  renderMultipleElementsSafely,
  releaseCanvasMemory,
} from "./pdfRenderUtils";
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
} from "recharts";
import html2canvas from "html2canvas";

const COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

const PRESET_RANGES = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "This Month", days: null },
  { label: "Last 3 Months", days: null },
  { label: "Custom", days: null },
];

function getDateRange(
  preset: string,
  customStart?: Date,
  customEnd?: Date,
): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "This Month") {
    return { start: startOfMonth(today), end: endOfMonth(today) };
  }

  if (preset === "Last 3 Months") {
    const start = startOfMonth(subDays(today, 90));
    return { start, end: endOfDay(today) };
  }

  if (preset === "Custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  const days = preset === "Last 7 Days" ? 7 : 30;
  return { start: subDays(today, days), end: endOfDay(today) };
}

export function ReportExport() {
  const [activeTab, setActiveTab] = useState("configure");
  const [reportType, setReportType] = useState<"pdf" | "csv">("pdf");
  const [datePreset, setDatePreset] = useState("Last 30 Days");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("INR");

  const expenseChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);

  const dateRange = useMemo(
    () => getDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  const expenseSummary: ExpenseSummaryItem[] = useMemo(
    () => generateExpenseSummary(transactions),
    [transactions],
  );

  const incomeSummary: IncomeSummaryItem[] = useMemo(
    () => generateIncomeSummary(transactions),
    [transactions],
  );

  const totalIncome = useMemo(
    () => incomeSummary.reduce((sum, item) => sum + item.total, 0),
    [incomeSummary],
  );

  const totalExpenses = useMemo(
    () => expenseSummary.reduce((sum, item) => sum + item.total, 0),
    [expenseSummary],
  );

  useEffect(() => {
    const loadCurrency = async () => {
      if (!auth.currentUser) return;
      try {
        const snap = await getDoc(doc(db, "currencies", auth.currentUser.uid));
        if (snap.exists()) {
          const data = snap.data() as { baseCurrency?: string };
          if (data.baseCurrency) setBaseCurrency(data.baseCurrency);
        }
      } catch (e) {
        console.error("Failed to load currency settings:", e);
      }
    };
    loadCurrency();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      setLoading(true);
      try {
        const data = await fetchTransactionsForDateRange(
          auth.currentUser.uid,
          dateRange.start,
          dateRange.end,
        );
        setTransactions(data);
      } catch (e) {
        console.error("Failed to fetch transactions:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange.start, dateRange.end]);

  const handlePreview = () => {
    const data = buildReportData(
      auth.currentUser?.uid || "",
      reportType,
      dateRange.start,
      dateRange.end,
      transactions,
      expenseSummary,
      incomeSummary,
      baseCurrency,
    );
    setReportData(data);
    setShowPreview(true);
    setActiveTab("preview");
  };

  const [exportProgress, setExportProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: "",
  });

  const handleExport = async () => {
    if (!auth.currentUser) return;
    setExporting(true);
    setExportProgress({ percent: 10, stage: "Building report payload..." });

    let chartCanvases: HTMLCanvasElement[] = [];
    try {
      const data = buildReportData(
        auth.currentUser.uid,
        reportType,
        dateRange.start,
        dateRange.end,
        transactions,
        expenseSummary,
        incomeSummary,
        baseCurrency,
      );
      setReportData(data);

      if (reportType === "csv") {
        downloadCSV(data);
        await saveReportToFirestore(data);
      } else {
        const elementsToRender: HTMLElement[] = [];
        if (expenseChartRef.current) elementsToRender.push(expenseChartRef.current);
        if (incomeChartRef.current) elementsToRender.push(incomeChartRef.current);

        chartCanvases = await renderMultipleElementsSafely(
          elementsToRender,
          (percent, stage) => setExportProgress({ percent, stage })
        );

        setExportProgress({ percent: 90, stage: "Compiling vector PDF..." });
        await generatePDF(data, chartCanvases);
        await saveReportToFirestore(data);
      }
      toast.success("Report exported successfully!");
    } catch (e) {
      console.error("Export failed:", e);
      toast.error("Failed to export report. Please try again.");
    } finally {
      // Memory Cleanup: release all canvas buffers
      chartCanvases.forEach((canvas) => releaseCanvasMemory(canvas));
      setExporting(false);
      setExportProgress({ percent: 0, stage: "" });
    }
  };

  const isCustom = datePreset === "Custom";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate and export financial summaries for any period.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900/50 p-1 border border-slate-800 rounded-xl h-12 w-full max-w-[400px]">
          <TabsTrigger
            value="configure"
            className="flex-1 rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold tracking-wider"
          >
            CONFIGURE
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="flex-1 rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 text-xs font-bold tracking-wider"
          >
            PREVIEW
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configure" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="bg-slate-900 border-slate-800 lg:col-span-1">
              <CardHeader className="pb-4">
                <CardTitle className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-400" />
                  Date Range
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs">
                  Select the period for your report.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Preset
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_RANGES.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setDatePreset(preset.label)}
                        className={`text-xs font-bold py-2 px-3 rounded-lg border transition-all ${
                          datePreset === preset.label
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isCustom && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        From
                      </label>
                      <input
                        type="date"
                        value={
                          customStart ? format(customStart, "yyyy-MM-dd") : ""
                        }
                        onChange={(e) =>
                          setCustomStart(
                            e.target.value
                              ? new Date(e.target.value)
                              : undefined,
                          )
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        To
                      </label>
                      <input
                        type="date"
                        value={customEnd ? format(customEnd, "yyyy-MM-dd") : ""}
                        onChange={(e) =>
                          setCustomEnd(
                            e.target.value
                              ? new Date(e.target.value)
                              : undefined,
                          )
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Selected Period
                  </p>
                  <p className="text-sm text-white font-medium">
                    {format(dateRange.start, "dd MMM yyyy")}
                  </p>
                  <p className="text-xs text-slate-500">
                    to {format(dateRange.end, "dd MMM yyyy")}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <Filter size={16} className="text-indigo-400" />
                  Export Settings
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs">
                  Choose the report format and options.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Report Type
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setReportType("pdf")}
                      className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                        reportType === "pdf"
                          ? "bg-indigo-600/10 border-indigo-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      <Printer
                        size={28}
                        className={
                          reportType === "pdf"
                            ? "text-indigo-400"
                            : "text-slate-500"
                        }
                      />
                      <div className="text-center">
                        <p className="text-sm font-bold">PDF Report</p>
                        <p className="text-[10px] uppercase tracking-wider opacity-70">
                          With Charts
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => setReportType("csv")}
                      className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                        reportType === "csv"
                          ? "bg-emerald-600/10 border-emerald-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      <FileSpreadsheet
                        size={28}
                        className={
                          reportType === "csv"
                            ? "text-emerald-400"
                            : "text-slate-500"
                        }
                      />
                      <div className="text-center">
                        <p className="text-sm font-bold">CSV Export</p>
                        <p className="text-[10px] uppercase tracking-wider opacity-70">
                          Raw Data
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-800 p-4 bg-slate-800/30">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                      Transactions
                    </p>
                    <p className="text-2xl font-bold text-white tabular-nums">
                      {loading ? (
                        <Skeleton className="h-8 w-16 bg-slate-700" />
                      ) : (
                        transactions.length
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 p-4 bg-slate-800/30">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                      Net Balance
                    </p>
                    <p
                      className={`text-2xl font-bold tabular-nums ${totalIncome - totalExpenses >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {loading ? (
                        <Skeleton className="h-8 w-20 bg-slate-700" />
                      ) : (
                        formatCurrency(totalIncome - totalExpenses, baseCurrency)
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handlePreview}
                    disabled={loading || transactions.length === 0}
                    variant="outline"
                    className="flex-1 h-12 gap-2 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-bold text-xs uppercase tracking-widest rounded-xl"
                  >
                    <FileText size={16} />
                    Preview Report
                  </Button>
                  <Button
                    onClick={handleExport}
                    disabled={loading || exporting || transactions.length === 0}
                    className="flex-1 h-12 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-900/20 rounded-xl"
                  >
                    {exporting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Export {reportType.toUpperCase()}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {reportType === "pdf" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 size={16} className="text-indigo-400" />
                    Expense Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={expenseChartRef} className="min-h-[250px]">
                    {expenseSummary.length === 0 ? (
                      <div className="flex items-center justify-center h-[250px] text-slate-600">
                        <p className="text-sm font-medium">
                          No expense data available
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={expenseSummary}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#1e293b"
                          />
                          <XAxis
                            dataKey="category"
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
                            tickFormatter={(val) => formatCurrency(val, baseCurrency)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f1219",
                              border: "1px solid #1e293b",
                              borderRadius: "8px",
                            }}
                            itemStyle={{ color: "#f8fafc" }}
                            formatter={(value: any) => [
                              formatCurrency(value, baseCurrency),
                              "Total",
                            ]}
                          />
                          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                            {expenseSummary.map((entry, index) => (
                              <Cell
                                key={entry.category}
                                fill={COLORS[index % COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <PieChartIcon size={16} className="text-emerald-400" />
                    Income Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={incomeChartRef} className="min-h-[250px]">
                    {incomeSummary.length === 0 ? (
                      <div className="flex items-center justify-center h-[250px] text-slate-600">
                        <p className="text-sm font-medium">
                          No income data available
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={incomeSummary}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }: any) =>
                              `${name} ${(percent * 100).toFixed(0)}%`
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total"
                          >
                            {incomeSummary.map((entry, index) => (
                              <Cell
                                key={entry.source}
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
                            formatter={(value: any) => [
                              formatCurrency(value, baseCurrency),
                              "Total",
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          {showPreview && reportData ? (
            <ReportPreview reportData={reportData} />
          ) : (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-slate-700 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">
                  No Preview Available
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  Configure your report and click Preview Report to see a
                  summary.
                </p>
                <Button
                  onClick={() => setActiveTab("configure")}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest"
                >
                  Go to Configure
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
