import React, { useState } from 'react';
import { Scale, TrendingUp, AlertCircle, ArrowRightLeft, Loader2, CheckCircle } from 'lucide-react';

interface Asset {
  ticker: string;
  shares: number;
  currentPrice: number;
  targetPercentage: number;
}

export default function PortfolioRebalancer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Mocking initial state that would normally be fetched from the user's linked brokerage
  const [assets, setAssets] = useState<Asset[]>([
    { ticker: 'VTI', shares: 145, currentPrice: 250.50, targetPercentage: 60 },
    { ticker: 'VXUS', shares: 210, currentPrice: 58.20, targetPercentage: 20 },
    { ticker: 'BND', shares: 350, currentPrice: 72.10, targetPercentage: 20 }
  ]);

  const totalTarget = assets.reduce((sum, a) => sum + Number(a.targetPercentage), 0);
  const isBalanced = Math.abs(totalTarget - 100) < 0.01;

  const updateAsset = (index: number, field: keyof Asset, value: string) => {
    const newAssets = [...assets];
    newAssets[index] = { ...newAssets[index], [field]: Number(value) };
    setAssets(newAssets);
  };

  const handleRebalance = async () => {
    if (!isBalanced) {
      setError(`Targets must equal exactly 100%. Currently at ${totalTarget}%.`);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/portfolio/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets })
      });
      
      const json = await response.json();
      if (json.success) {
        setResult(json.data);
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError("Failed to reach rebalancing engine.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-8">
      
      {/* Configuration Panel */}
      <div className="w-full lg:w-1/2 flex flex-col">
        <div className="mb-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Scale className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Portfolio Rebalancer</h2>
          </div>
          <p className="text-sm text-slate-500">Calculate the exact trades needed to align your current holdings with your target asset allocation.</p>
        </div>

        <div className="space-y-4 mb-6 flex-1">
          {assets.map((asset, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl items-center">
              <div className="w-full sm:w-1/4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ticker</label>
                <div className="font-bold text-slate-700 bg-white px-3 py-2 border border-slate-200 rounded-lg text-center">{asset.ticker}</div>
              </div>
              <div className="w-full sm:w-1/4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Shares</label>
                <input 
                  type="number" value={asset.shares} 
                  onChange={(e) => updateAsset(idx, 'shares', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              <div className="w-full sm:w-1/4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Price ($)</label>
                <input 
                  type="number" step="0.01" value={asset.currentPrice} 
                  onChange={(e) => updateAsset(idx, 'currentPrice', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              <div className="w-full sm:w-1/4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target (%)</label>
                <div className="relative">
                  <input 
                    type="number" value={asset.targetPercentage} 
                    onChange={(e) => updateAsset(idx, 'targetPercentage', e.target.value)}
                    className="w-full pl-3 pr-6 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-bold text-indigo-700"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-xl mb-6">
          <span className="font-semibold text-slate-600">Total Target Allocation:</span>
          <span className={`font-black text-lg ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
            {totalTarget}%
          </span>
        </div>

        <button 
          onClick={handleRebalance}
          disabled={loading || !isBalanced}
          className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Calculate Rebalancing Orders'}
        </button>

        {error && (
          <p className="mt-4 text-sm font-semibold text-rose-600 flex items-center gap-1 bg-rose-50 p-3 rounded-lg border border-rose-200">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}
      </div>

      {/* Results Panel */}
      <div className="w-full lg:w-1/2 flex flex-col bg-slate-50 border border-slate-200 p-6 rounded-2xl relative overflow-hidden">
        {!result ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/80 z-10">
            <ArrowRightLeft className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Run calculator to view trade orders.</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4 z-20 h-full flex flex-col">
            <div className="flex justify-between items-end mb-6">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Portfolio Value</p>
                <p className="text-3xl font-black text-slate-800">{formatCurrency(result.totalPortfolioValue)}</p>
              </div>
              {result.driftWarning && (
                <div className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                  <AlertCircle className="w-3 h-3" /> High Drift Detected (>5%)
                </div>
              )}
            </div>

            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Recommended Trades</h3>
            
            {result.recommendedOrders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle className="w-8 h-8 mb-2" />
                <p className="font-bold">Portfolio is perfectly balanced.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {result.recommendedOrders.map((order: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                    order.action === 'BUY' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1 rounded font-black text-sm tracking-wider ${
                        order.action === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                      }`}>
                        {order.action}
                      </div>
                      <div className="font-bold text-slate-800 text-lg">{order.ticker}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-700">{order.shares} sh</div>
                      <div className={`text-sm font-semibold ${order.action === 'BUY' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatCurrency(order.estimatedValue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4" /> FinSight is not a broker. Execute these trades manually in your linked accounts.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
