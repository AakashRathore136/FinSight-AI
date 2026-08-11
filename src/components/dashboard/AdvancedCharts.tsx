/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import { Activity, Loader2, ShieldAlert } from "lucide-react";

interface ChartProps {
  data?: any[];
  isLoading?: boolean;
}

function EmptyState({
  message,
  icon: Icon = Activity,
}: {
  message: string;
  icon?: any;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 w-full min-h-[250px] bg-slate-900/50 rounded-xl border border-dashed border-slate-800 p-6 text-center">
      <Icon className="h-8 w-8 mb-3 opacity-30 text-indigo-400" />
      <span className="text-sm font-bold tracking-wider uppercase text-slate-300">
        {message}
      </span>
      <span className="text-xs mt-1.5 opacity-60 max-w-[280px]">
        FinSight AI secure processing engine is active. Ingest or process a
        document to compile live analytics.
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-indigo-400 w-full min-h-[250px]">
      <Loader2 className="h-8 w-8 mb-2 animate-spin" />
      <span className="text-sm font-bold tracking-wider uppercase text-indigo-300">
        Processing Data Analytics
      </span>
    </div>
  );
}

interface TrendChartProps extends ChartProps {
  title?: string;
  dataKey?: string;
  color?: string;
  valueSuffix?: string;
}

const MS_PER_HOUR = 3600 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function getRangeMs(range: string) {
  switch (range) {
    case "12H":
      return 12 * MS_PER_HOUR;
    case "24H":
      return 24 * MS_PER_HOUR;
    case "1W":
      return 7 * MS_PER_DAY;
    case "1M":
      return 30 * MS_PER_DAY;
    case "1Y":
      return 365 * MS_PER_DAY;
    case "5Y":
      return 5 * 365 * MS_PER_DAY;
    case "ALL":
      return Infinity;
    default:
      return Infinity;
  }
}

export function DynamicTrendChart({
  data,
  isLoading,
  title = "AI Confidence Trend",
  dataKey = "confidence",
  color = "#4f46e5",
  valueSuffix = "%",
}: TrendChartProps) {
  const [timeRange, setTimeRange] = useState("12H");
  const ranges = ["12H", "24H", "1W", "1M", "1Y", "5Y", "ALL"];

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const now = Date.now();
    let cutoff = timeRange === "ALL" ? 0 : now - getRangeMs(timeRange);

    if (timeRange === "ALL") {
      const minDate = Math.min(...data.map((d) => d.timestamp));
      cutoff = minDate;
    }

    const bucketed = new Map<string, any>();
    const current = new Date(cutoff);
    const end = new Date(now);

    // Ensure current is aligned to the interval
    if (timeRange === "12H" || timeRange === "24H") {
      current.setMinutes(0, 0, 0);
    } else if (timeRange === "1W" || timeRange === "1M") {
      current.setHours(0, 0, 0, 0);
    } else {
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    }

    // Pre-fill all buckets in range
    while (current.getTime() <= end.getTime()) {
      const key = current.getTime().toString();
      let displayDate = "";

      if (timeRange === "12H" || timeRange === "24H") {
        displayDate = current.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        bucketed.set(key, {
          sum: 0,
          count: 0,
          timestamp: current.getTime(),
          displayDate,
        });
        current.setHours(current.getHours() + 1);
      } else if (timeRange === "1W" || timeRange === "1M") {
        displayDate = current.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        bucketed.set(key, {
          sum: 0,
          count: 0,
          timestamp: current.getTime(),
          displayDate,
        });
        current.setDate(current.getDate() + 1);
      } else {
        displayDate = current.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        });
        bucketed.set(key, {
          sum: 0,
          count: 0,
          timestamp: current.getTime(),
          displayDate,
        });
        current.setMonth(current.getMonth() + 1);
      }
    }

    const filtered = data.filter((d) => d.timestamp >= cutoff);

    filtered.forEach((d) => {
      const date = new Date(d.timestamp);
      let key = "";

      if (timeRange === "12H" || timeRange === "24H") {
        date.setMinutes(0, 0, 0);
      } else if (timeRange === "1W" || timeRange === "1M") {
        date.setHours(0, 0, 0, 0);
      } else {
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
      }
      key = date.getTime().toString();

      if (bucketed.has(key)) {
        const b = bucketed.get(key)!;
        const val = d[dataKey] || 0;
        b.sum += val;
        b.count += 1;
      }
    });

    return Array.from(bucketed.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((b) => ({
        date: b.displayDate,
        [dataKey]:
          dataKey === "count"
            ? b.sum
            : b.count > 0
              ? Math.round(b.sum / b.count)
              : 0,
      }));
  }, [data, timeRange, dataKey]);

  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="p-5 border-b border-slate-800 flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
          {title}
        </CardTitle>
        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${timeRange === r ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-1 min-h-[250px]">
        {isLoading ? (
          <LoadingState />
        ) : !processedData || processedData.length === 0 ? (
          <EmptyState message={`No ${dataKey} data recorded`} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={processedData}
              margin={{ top: 15, right: 10, left: 15, bottom: 0 }}
            >
              <defs>
                <linearGradient id="trendColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="date"
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
                tickFormatter={(val) => `${val}${valueSuffix}`}
                width={85}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f1219",
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                }}
                itemStyle={{ color: "#f8fafc" }}
                labelStyle={{ color: "#94a3b8" }}
              />

              {/* Institutional Target Reference/Threshold Lines */}
              {dataKey === "confidence" && (
                <ReferenceLine
                  y={85}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: "Policy Tolerance Limit",
                    fill: "#ef4444",
                    fontSize: 10,
                    position: "top",
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey={dataKey}
                name={title.split(" ").pop()}
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#trendColor)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function RiskDistributionChart({ data, isLoading }: ChartProps) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="p-5 border-b border-slate-800 pb-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
          Risk Profile Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 flex-1 min-h-[250px]">
        {isLoading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message="No Risk Profiles Computed" icon={ShieldAlert} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                horizontal={true}
                vertical={false}
              />
              <XAxis
                type="number"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip
                cursor={{ fill: "#1e293b" }}
                contentStyle={{
                  backgroundColor: "#0f1219",
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                }}
                formatter={(val) => [`${val} Docs`, "Count"]}
              />
              <ReferenceLine x={0} stroke="#334155" />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.name === "High"
                        ? "#ef4444"
                        : entry.name === "Medium"
                          ? "#f59e0b"
                          : "#10b981"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function EntityExposureHeatmap({ data, isLoading }: ChartProps) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="p-5 border-b border-slate-800 pb-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
          Top Extracted Entities
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 flex-1 flex flex-col justify-center min-h-[250px]">
        {isLoading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message="Awaiting Ingest Pipeline" icon={ShieldAlert} />
        ) : (
          <div className="grid grid-cols-2 gap-2 h-full">
            {data.map((sec) => (
              <div
                key={sec.sector}
                className="flex flex-col items-start justify-between p-3 rounded-lg"
                style={{
                  backgroundColor:
                    sec.risk === "High"
                      ? "rgba(239, 68, 68, 0.2)"
                      : sec.risk === "Medium"
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(16, 185, 129, 0.2)",
                  border: `1px solid ${
                    sec.risk === "High"
                      ? "rgba(239, 68, 68, 0.4)"
                      : sec.risk === "Medium"
                        ? "rgba(245, 158, 11, 0.4)"
                        : "rgba(16, 185, 129, 0.4)"
                  }`,
                  gridRow: sec.weight > 3 ? "span 2" : "span 1",
                }}
              >
                <span className="text-[10px] font-bold text-slate-300 uppercase leading-tight line-clamp-2">
                  {sec.sector}
                </span>
                <div className="flex w-full justify-between items-end mt-2">
                  <span className="text-xl font-black text-white tabular-nums">
                    {sec.weight}
                  </span>
                  <span className="text-[9px] font-mono opacity-60 uppercase">
                    MENTIONS
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
