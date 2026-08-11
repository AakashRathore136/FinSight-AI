import React, { useEffect, useState } from 'react';
import { ShieldAlert, TrendingDown, DollarSign } from 'lucide-react';

interface HarvestOpportunity {
  ticker: string;
  status: string;
  reason: string;
  harvestableLoss: number;
  potentialSavings: number;
  sharesToSell?: number;
}

export default function TaxLossHarvester() {
  const [opportunities, setOpportunities] = useState<HarvestOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo feature without a serverless endpoint (see #895): no request is
    // issued to the non-existent /api/portfolio/tax-loss-harvesting route.
    setOpportunities([]);
    setLoading(false);
  }, []);

  const totalSavings = opportunities.reduce((acc, curr) => acc + curr.potentialSavings, 0);

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Scanning portfolio for tax optimization...</div>;
  }

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Tax-Loss Harvesting</h2>
          <p className="text-sm text-slate-500">Offset your capital gains by intelligently realizing portfolio losses.</p>
        </div>
        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-right">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Potential Savings</p>
          <p className="text-2xl font-black">${totalSavings.toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-4">
        {opportunities.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No harvesting opportunities found at this time.</p>
        ) : (
          opportunities.map((opp) => (
            <div 
              key={opp.ticker} 
              className={`p-4 rounded-xl border ${
                opp.status === 'Wash Sale Restricted' ? 'border-orange-200 bg-orange-50' : 'border-blue-100 bg-blue-50/30'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-800">{opp.ticker}</h3>
                  {opp.status === 'Wash Sale Restricted' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-1 rounded">
                      <ShieldAlert className="w-3 h-3" /> Wash Sale Risk
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      <TrendingDown className="w-3 h-3" /> Opportunity
                    </span>
                  )}
                </div>
                
                {opp.harvestableLoss > 0 && (
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">Est. Tax Savings</p>
                    <p className="text-lg font-black text-green-600 flex items-center justify-end">
                      <DollarSign className="w-4 h-4" />{opp.potentialSavings.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              
              <p className={`text-sm ${opp.status === 'Wash Sale Restricted' ? 'text-orange-800' : 'text-slate-600'}`}>
                {opp.reason}
              </p>
            </div>
          ))
        )}
      </div>
      
      <p className="text-xs text-gray-400 mt-6 text-center">
        Disclaimer: This tool provides estimates based on a 24% marginal tax rate and FIFO lot accounting. It is not official tax advice.
      </p>
    </div>
  );
}
