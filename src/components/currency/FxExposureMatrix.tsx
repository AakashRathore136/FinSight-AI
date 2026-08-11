import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Globe, DollarSign, ArrowUpRight } from "lucide-react";
import { HedgingRecommendations, HedgingRecommendation } from "./HedgingRecommendations";

export const FxExposureMatrix: React.FC = () => {
  const mockRecommendations: HedgingRecommendation[] = [
    {
      id: "fx-01",
      currencyPair: "EUR/USD",
      exposureAmount: 145000,
      riskLevel: "HIGH",
      suggestedAction: "Purchase 90-day EUR/USD Put Option at strike 1.08 to cap downside risk.",
      estimatedHedgeCost: 1200,
    },
    {
      id: "fx-02",
      currencyPair: "GBP/USD",
      exposureAmount: 82000,
      riskLevel: "MEDIUM",
      suggestedAction: "Lock in forward contract for 50% of Q4 receivables.",
      estimatedHedgeCost: 450,
    },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Globe size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">FX Currency Exposure & Hedging Matrix</CardTitle>
            <p className="text-xs text-slate-400">Multi-currency volatility analytics & forward contract recommendations</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">Total Foreign Asset Value</span>
            <p className="text-2xl font-black text-white">$227,000</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">Unhedged Volatility Risk</span>
            <p className="text-2xl font-black text-amber-400">14.2%</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">Suggested Hedge Coverage</span>
            <p className="text-2xl font-black text-emerald-400">75%</p>
          </div>
        </div>

        <HedgingRecommendations recommendations={mockRecommendations} />
      </CardContent>
    </Card>
  );
};
