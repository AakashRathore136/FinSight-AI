import React from "react";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

export interface CapitalGainLot {
  id: string;
  assetSymbol: string;
  purchaseDate: string;
  holdingDays: number;
  unrealizedGainLoss: number;
  isShortTerm: boolean;
}

interface CapitalGainsBreakdownProps {
  lots: CapitalGainLot[];
}

export const CapitalGainsBreakdown: React.FC<CapitalGainsBreakdownProps> = ({ lots }) => {
  const shortTermTotal = lots
    .filter((l) => l.isShortTerm)
    .reduce((acc, l) => acc + l.unrealizedGainLoss, 0);

  const longTermTotal = lots
    .filter((l) => !l.isShortTerm)
    .reduce((acc, l) => acc + l.unrealizedGainLoss, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <Clock size={14} className="text-indigo-400" /> Short-Term Capital Gains (&lt; 1 Yr)
            </span>
            <p className={`text-xl font-black ${shortTermTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ${shortTermTotal.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <Clock size={14} className="text-emerald-400" /> Long-Term Capital Gains (&ge; 1 Yr)
            </span>
            <p className={`text-xl font-black ${longTermTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ${longTermTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="p-3">Asset</th>
              <th className="p-3">Holding Period</th>
              <th className="p-3">Classification</th>
              <th className="p-3 text-right">Gain / Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {lots.map((lot) => (
              <tr key={lot.id} className="hover:bg-slate-800/30">
                <td className="p-3 font-bold text-white">{lot.assetSymbol}</td>
                <td className="p-3">{lot.holdingDays} Days</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      lot.isShortTerm ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {lot.isShortTerm ? "STCG" : "LTCG"}
                  </span>
                </td>
                <td className={`p-3 text-right font-bold ${lot.unrealizedGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  ${lot.unrealizedGainLoss.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
