import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { SlidersHorizontal, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { TornadoChart } from "./TornadoChart";
import { calculateSensitivityDrivers } from "@/src/lib/sensitivityUtils";

export const SensitivityAnalysis: React.FC = () => {
  const [revenue, setRevenue] = useState(1000000);
  const [cogs, setCogs] = useState(600000);
  const [opex, setOpex] = useState(200000);
  const [interestRate, setInterestRate] = useState(5);

  const variables = calculateSensitivityDrivers(revenue, cogs, opex, interestRate);

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Financial Sensitivity Analysis & Tornado Chart</CardTitle>
            <p className="text-xs text-slate-400">Single-factor variable swing impact ranking on net earnings</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
          <div>
            <label className="text-xs font-semibold text-slate-400">Baseline Revenue ($)</label>
            <input
              type="number"
              value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">COGS ($)</label>
            <input
              type="number"
              value={cogs}
              onChange={(e) => setCogs(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">OPEX ($)</label>
            <input
              type="number"
              value={opex}
              onChange={(e) => setOpex(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Interest Rate (%)</label>
            <input
              type="number"
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <TornadoChart variables={variables} />
      </CardContent>
    </Card>
  );
};
