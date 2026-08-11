import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { TrendingUp, Plus, Layers, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ScenarioEditorModal, ScenarioPreset } from "./ScenarioEditorModal";

export const MultiScenarioMatrix: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioPreset[]>([
    { id: "base", name: "Baseline (Current Trajectory)", revenueGrowthModifier: 0, expenseInflationModifier: 0, defaultProbabilityModifier: 0 },
    { id: "pessimistic", name: "Bear Market (-20% Rev, +15% Exp)", revenueGrowthModifier: -20, expenseInflationModifier: 15, defaultProbabilityModifier: 10 },
    { id: "optimistic", name: "Bull Expansion (+25% Rev, -5% Exp)", revenueGrowthModifier: 25, expenseInflationModifier: -5, defaultProbabilityModifier: -2 },
  ]);

  // Generate 12-month projected curves
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const baseMonthlyCash = 50000;

  const chartData = months.map((month, idx) => {
    const dataPoint: Record<string, any> = { month };
    scenarios.forEach((scen) => {
      const growthFactor = 1 + (scen.revenueGrowthModifier / 100) * ((idx + 1) / 12);
      const expenseFactor = 1 + (scen.expenseInflationModifier / 100) * ((idx + 1) / 12);
      const netCash = Math.round(baseMonthlyCash * (idx + 1) * (growthFactor / expenseFactor));
      dataPoint[scen.name] = netCash;
    });
    return dataPoint;
  });

  const colors = ["#6366f1", "#ef4444", "#10b981", "#f59e0b", "#ec4899"];

  const addScenario = (newScen: ScenarioPreset) => {
    setScenarios([...scenarios, newScen]);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Multi-Scenario Cash Flow Matrix</CardTitle>
            <p className="text-xs text-slate-400">Comparative macro-economic projection curves</p>
          </div>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2"
        >
          <Plus size={16} /> Add Scenario
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.5rem" }}
                formatter={(val: any) => [`$${Number(val).toLocaleString()}`, "Net Balance"]}
              />
              <Legend wrapperStyle={{ paddingTop: "10px" }} />
              {scenarios.map((scen, index) => (
                <Line
                  key={scen.id}
                  type="monotone"
                  dataKey={scen.name}
                  stroke={colors[index % colors.length]}
                  strokeWidth={3}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ScenarioEditorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={addScenario}
        />
      </CardContent>
    </Card>
  );
};
