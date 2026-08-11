import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Activity, Play, RefreshCw, AlertTriangle, TrendingDown } from "lucide-react";
import { RiskDistributionChart, TrajectoryPoint } from "./RiskDistributionChart";

export const MonteCarloSimulator: React.FC = () => {
  const [initialValue, setInitialValue] = useState<number>(100000);
  const [days, setDays] = useState<number>(252); // 1 trading year
  const [numSimulations, setNumSimulations] = useState<number>(1000);
  const [volatility, setVolatility] = useState<number>(0.2); // 20% annualized vol
  const [expectedReturn, setExpectedReturn] = useState<number>(0.08); // 8% drift
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [trajectories, setTrajectories] = useState<TrajectoryPoint[]>([]);
  const [var95, setVar95] = useState<number | null>(null);

  const runSimulation = () => {
    setIsSimulating(true);

    setTimeout(() => {
      const dt = 1 / 252;
      const drift = (expectedReturn - 0.5 * Math.pow(volatility, 2)) * dt;
      const volStep = volatility * Math.sqrt(dt);

      const allPaths: number[][] = Array.from({ length: numSimulations }, () => [initialValue]);

      for (let s = 0; s < numSimulations; s++) {
        let currentPrice = initialValue;
        for (let d = 1; d <= days; d += 5) {
          // Standard Normal approximation (Box-Muller transform)
          const u1 = Math.random();
          const u2 = Math.random();
          const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

          currentPrice = currentPrice * Math.exp(drift * 5 + volStep * Math.sqrt(5) * z);
          allPaths[s].push(currentPrice);
        }
      }

      // Compute percentiles for each step
      const stepCount = allPaths[0].length;
      const points: TrajectoryPoint[] = [];
      const finalPrices: number[] = [];

      for (let stepIdx = 0; stepIdx < stepCount; stepIdx++) {
        const pricesAtStep = allPaths.map((p) => p[stepIdx]).sort((a, b) => a - b);
        if (stepIdx === stepCount - 1) {
          finalPrices.push(...pricesAtStep);
        }

        const p10 = pricesAtStep[Math.floor(pricesAtStep.length * 0.1)];
        const p50 = pricesAtStep[Math.floor(pricesAtStep.length * 0.5)];
        const p90 = pricesAtStep[Math.floor(pricesAtStep.length * 0.9)];

        points.push({
          step: stepIdx * 5,
          p10: Math.round(p10),
          p50: Math.round(p50),
          p90: Math.round(p90),
        });
      }

      // Compute 95% Value at Risk (VaR)
      finalPrices.sort((a, b) => a - b);
      const var95Value = initialValue - finalPrices[Math.floor(finalPrices.length * 0.05)];

      setTrajectories(points);
      setVar95(Math.round(var95Value));
      setIsSimulating(false);
    }, 100);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Monte Carlo Risk Simulator</CardTitle>
            <p className="text-xs text-slate-400">Stochastic geometric brownian motion multi-trial engine</p>
          </div>
        </div>
        <Button
          onClick={runSimulation}
          disabled={isSimulating}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2"
        >
          {isSimulating ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
          {isSimulating ? "Simulating..." : "Run 1,000 Trials"}
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
          <div>
            <label className="text-xs font-semibold text-slate-400">Initial Portfolio ($)</label>
            <input
              type="number"
              value={initialValue}
              onChange={(e) => setInitialValue(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Annual Volatility (%)</label>
            <input
              type="number"
              step="0.01"
              value={volatility}
              onChange={(e) => setVolatility(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Expected Annual Return (%)</label>
            <input
              type="number"
              step="0.01"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Trading Horizon (Days)</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* VaR Highlight */}
        {var95 !== null && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-red-400">95% Value-at-Risk (1-Yr)</span>
                <p className="text-xl font-black text-red-200">${var95.toLocaleString()}</p>
              </div>
              <TrendingDown size={24} className="text-red-400" />
            </div>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs font-semibold text-slate-400">P50 Median Projected Value</span>
              <p className="text-xl font-bold text-indigo-300">
                ${trajectories[trajectories.length - 1]?.p50.toLocaleString() || "0"}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
              <span className="text-xs font-semibold text-emerald-400">P90 Bull Projected Value</span>
              <p className="text-xl font-bold text-emerald-300">
                ${trajectories[trajectories.length - 1]?.p90.toLocaleString() || "0"}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        <RiskDistributionChart data={trajectories} />
      </CardContent>
    </Card>
  );
};
