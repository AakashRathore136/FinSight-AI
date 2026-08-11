import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Calculator, AlertTriangle, ArrowDownRight, CheckCircle2 } from "lucide-react";
import { CapitalGainsBreakdown, CapitalGainLot } from "./CapitalGainsBreakdown";

export const TaxLossHarvesting: React.FC = () => {
  const mockLots: CapitalGainLot[] = [
    { id: "lot-1", assetSymbol: "NVDA", purchaseDate: "2025-11-10", holdingDays: 270, unrealizedGainLoss: 12500, isShortTerm: true },
    { id: "lot-2", assetSymbol: "TSLA", purchaseDate: "2026-01-15", holdingDays: 200, unrealizedGainLoss: -4200, isShortTerm: true },
    { id: "lot-3", assetSymbol: "AAPL", purchaseDate: "2024-03-20", holdingDays: 870, unrealizedGainLoss: 18400, isShortTerm: false },
    { id: "lot-4", assetSymbol: "INTC", purchaseDate: "2025-09-05", holdingDays: 335, unrealizedGainLoss: -3100, isShortTerm: true },
  ];

  const harvestableLosses = mockLots
    .filter((l) => l.unrealizedGainLoss < 0)
    .reduce((acc, l) => acc + Math.abs(l.unrealizedGainLoss), 0);

  const estimatedTaxSavings = Math.round(harvestableLosses * 0.24); // 24% marginal tax savings estimate

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Calculator size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Tax Loss Harvesting & Capital Gains Engine</CardTitle>
            <p className="text-xs text-slate-400">Automated unrealized loss detection & 30-day wash-sale rule guard</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Harvesting Opportunity Identified</span>
            <p className="text-sm text-slate-200">
              Harvesting <strong className="text-white">${harvestableLosses.toLocaleString()}</strong> in unrealized losses can offset short-term capital gains.
            </p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-emerald-900/40 border border-emerald-700/50 text-right w-full md:w-auto">
            <span className="block text-[10px] text-emerald-300 uppercase font-semibold">Est. Tax Liability Savings</span>
            <span className="text-xl font-black text-emerald-400">${estimatedTaxSavings.toLocaleString()}</span>
          </div>
        </div>

        <CapitalGainsBreakdown lots={mockLots} />
      </CardContent>
    </Card>
  );
};
