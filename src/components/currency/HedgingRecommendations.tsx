import React from "react";
import { ShieldCheck, ArrowRightLeft, TrendingUp } from "lucide-react";

export interface HedgingRecommendation {
  id: string;
  currencyPair: string;
  exposureAmount: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  suggestedAction: string;
  estimatedHedgeCost: number;
}

interface HedgingRecommendationsProps {
  recommendations: HedgingRecommendation[];
}

export const HedgingRecommendations: React.FC<HedgingRecommendationsProps> = ({ recommendations }) => {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-400" />
        Automated FX Hedging Recommendations
      </h4>

      {recommendations.map((rec) => (
        <div
          key={rec.id}
          className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {rec.currencyPair}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  rec.riskLevel === "HIGH" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {rec.riskLevel} VOLATILITY
              </span>
            </div>
            <p className="text-xs text-slate-300">{rec.suggestedAction}</p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between border-t md:border-t-0 border-slate-800 pt-2 md:pt-0">
            <div className="text-right">
              <span className="block text-[10px] text-slate-500 font-semibold">Net Exposure</span>
              <span className="text-sm font-bold text-white">${rec.exposureAmount.toLocaleString()}</span>
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white flex items-center gap-1">
              <ArrowRightLeft size={14} /> Execute Hedge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
