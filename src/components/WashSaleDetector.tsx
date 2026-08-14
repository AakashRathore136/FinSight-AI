import React, { useEffect, useState } from 'react';
import { AlertOctagon, TrendingDown, Clock, ShieldAlert, Loader2 } from 'lucide-react';

interface WashSaleViolation {
  sellTradeId: string;
  buyTradeId: string;
  ticker: string;
  disallowedLoss: number;
  daysDifference: number;
}

interface DetectorData {
  totalViolations: number;
  totalDisallowedLosses: number;
  violations: WashSaleViolation[];
}

export default function WashSaleDetector() {
  const [data, setData] = useState<DetectorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDetector = async () => {
      try {
        const res = await fetch('/api/tax/detect-wash-sales');
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) {
        console.error("Failed to detect wash sales", err);
      } finally {
        setLoading(false);
      }
    };
    runDetector();
  }, []);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading || !data) {
    return (
      <div className="w-full max-w-4xl mx-auto p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500 mb-4" />
        <p>Scanning 61-day rolling transaction windows...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Wash Sale Rule Detector</h2>
          <p className="text-sm text-slate-500">
            Automatically flags trades that violate the IRS 30-day Wash Sale rule across all your linked brokerages.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col justify-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Disallowed Tax Deductions</p>
          <p className="text-4xl font-black text-rose-600">
            {formatCurrency(data.totalDisallowedLosses)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Losses you cannot claim on your tax return this year.</p>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl text-rose-800 flex flex-col justify-center gap-2">
          <h3 className="font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" /> What is a Wash Sale?
          </h3>
          <p className="text-sm text-rose-700/80 leading-relaxed">
            If you sell a security at a loss and buy a "substantially identical" security within 30 days before or after the sale, the IRS disallows the capital loss deduction.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          Detected Violations ({data.totalViolations})
        </h3>

        {data.violations.length === 0 ? (
          <div className="text-center p-8 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
            <p className="font-bold">Clear!</p>
            <p className="text-sm mt-1">No wash sales detected in your trading history.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.violations.map((violation, idx) => (
              <div key={idx} className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-bold text-slate-800 text-lg">{violation.ticker}</span>
                      <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Wash Sale
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Re-bought {violation.daysDifference} days after realizing loss
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Disallowed Loss</p>
                    <p className="font-black text-rose-600 text-xl flex items-center justify-end gap-1">
                      <TrendingDown className="w-4 h-4" /> {formatCurrency(violation.disallowedLoss)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">Sell Trade ID:</span> <span className="text-slate-700 font-mono">{violation.sellTradeId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Buy Trade ID:</span> <span className="text-slate-700 font-mono">{violation.buyTradeId}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
