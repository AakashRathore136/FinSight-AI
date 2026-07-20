import { Card } from "@/src/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

export function MetricCard({
  title,
  value,
  change,
  changeType = "neutral",
  subtitle,
  sparklineData = null,
  sparklineColor = "#4f46e5",
  alert = false,
}: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  sparklineData?: any[];
  sparklineColor?: string;
  alert?: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden bg-slate-900/80 border-slate-800 p-5 rounded-xl transition-all hover:bg-slate-800/50 ${alert ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : ""}`}
    >
      {alert && <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {title}
          </span>
          <span className="text-2xl font-black tracking-tight text-white tabular-nums">
            {value}
          </span>
        </div>

        {change && (
          <div
            className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${
              changeType === "positive"
                ? "text-emerald-400 bg-emerald-400/10"
                : changeType === "negative"
                  ? "text-red-400 bg-red-400/10"
                  : "text-slate-400 bg-slate-800"
            }`}
          >
            {changeType === "positive" && <TrendingUp size={12} />}
            {changeType === "negative" && <TrendingDown size={12} />}
            {changeType === "neutral" && <Minus size={12} />}
            {change}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between h-10">
        <span className="text-xs text-slate-500 max-w-[60%] leading-tight">
          {subtitle}
        </span>

        {sparklineData && (
          <div className="h-12 w-24 -mb-2 -mr-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient
                    id={`color-${title.replace(/\s+/g, "-")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={sparklineColor}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={sparklineColor}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#color-${title.replace(/\s+/g, "-")})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const label = String(level || "Pending");
  const normalized = label.toLowerCase();
  const isHigh = normalized === "high" || normalized === "critical";
  const isMedium = normalized === "medium";

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
        isHigh
          ? "bg-red-500/10 text-red-400 border-red-500/20"
          : isMedium
            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      }`}
    >
      {label}
    </span>
  );
}
