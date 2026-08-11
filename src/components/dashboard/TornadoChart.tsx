import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";
import { SensitivityVariable } from "@/src/lib/sensitivityUtils";

interface TornadoChartProps {
  variables: SensitivityVariable[];
}

export const TornadoChart: React.FC<TornadoChartProps> = ({ variables }) => {
  // Format variables for symmetric Tornado Bar rendering
  const data = variables
    .map((v) => ({
      name: v.name,
      lowSwing: v.lowSwingImpact,
      highSwing: v.highSwingImpact,
      maxAbs: Math.max(Math.abs(v.lowSwingImpact), Math.abs(v.highSwingImpact)),
    }))
    .sort((a, b) => b.maxAbs - a.maxAbs);

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 10, right: 30, left: 60, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
          <XAxis
            type="number"
            stroke="#94a3b8"
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} width={140} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.5rem" }}
            formatter={(val: any) => [`$${Number(val).toLocaleString()}`, "Net Earnings Swing"]}
          />
          <ReferenceLine x={0} stroke="#64748b" strokeWidth={2} />
          <Bar dataKey="lowSwing" fill="#ef4444" name="-20% Downside Swing" />
          <Bar dataKey="highSwing" fill="#10b981" name="+20% Upside Swing" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
