import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface TrajectoryPoint {
  step: number;
  p10: number;
  p50: number;
  p90: number;
}

interface RiskDistributionChartProps {
  data: TrajectoryPoint[];
}

export const RiskDistributionChart: React.FC<RiskDistributionChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-900/50 text-slate-500 text-sm">
        No simulation data available. Run simulation to view percentile paths.
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="p90Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="p10Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
          <XAxis dataKey="step" stroke="#94a3b8" tick={{ fontSize: 12 }} label={{ value: "Trading Days", position: "insideBottom", offset: -5, fill: "#94a3b8" }} />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.5rem" }}
            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Valuation"]}
          />
          <Area type="monotone" dataKey="p90" stroke="#10b981" fillOpacity={1} fill="url(#p90Grad)" name="P90 (Bull)" />
          <Area type="monotone" dataKey="p50" stroke="#6366f1" fillOpacity={1} fill="url(#p50Grad)" name="P50 (Median)" />
          <Area type="monotone" dataKey="p10" stroke="#ef4444" fillOpacity={1} fill="url(#p10Grad)" name="P10 (Bear)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
