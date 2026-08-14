import React, { useState } from 'react';
import { Calculator, TrendingDown, ArrowRight, DollarSign, CheckCircle2, Loader2 } from 'lucide-react';

export default function TaxLotOptimizer() {
  const [ticker, setTicker] = useState('AAPL');
  const [amount, setAmount] = useState<number>(5000);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/tax/optimize-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.toUpperCase(), targetLiquidationAmount: amount })
      });
      const json = await response.json();
      
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Optimization failed");
      }
    } catch (err) {
      setError("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
          <Calculator className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Tax-Lot Optimizer</h2>
          <p className="text-sm text-slate-500">Minimize capital gains taxes by strategically selling specific shares (HIFO).</p>
        </div>
      </div>

      <form onSubmit={handleOptimize} className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Asset Ticker</label>
          <input 
            type="text" 
            value={ticker} 
            onChange={e => setTicker(e.target.value)}
            placeholder="AAPL"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold uppercase"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Liquidation Target ($)</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(Number(e.target.value))}
              min="1"
              className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
            />
          </div>
        </div>
        <div className="flex items-end">
          <button 
            type="submit"
            disabled={loading || amount <= 0 || !ticker}
            className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 h-[50px]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Optimize Sale'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-medium mb-6">
          {error}
        </div>
      )}

      {data && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-emerald-800 font-bold text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Recommended Strategy: {data.recommendedStrategy}
              </h3>
              <p className="text-emerald-700 text-sm mt-1">
                By selecting specific tax lots (Highest In, First Out), you lower your recognized capital gains.
              </p>
            </div>
            <div className="bg-white px-6 py-4 rounded-xl shadow-sm text-center border border-emerald-100">
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">Estimated Tax Savings</p>
              <p className="text-3xl font-black text-emerald-600">{formatCurrency(data.taxSavingsEstimated)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* HIFO Column */}
            <div className="border border-emerald-200 rounded-2xl overflow-hidden shadow-sm relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
              <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h4 className="font-bold text-slate-800">HIFO Strategy (Optimized)</h4>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">Winner</span>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Cap Gains</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.strategies.HIFO.totalCapitalGains)}</p>
                  </div>
                  <TrendingDown className="w-8 h-8 text-emerald-500 opacity-20 absolute right-8 top-20" />
                </div>
                
                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Lots to Sell:</p>
                <div className="space-y-2">
                  {data.strategies.HIFO.lotsSold.map((lot: any) => (
                    <div key={lot.lotId} className="flex justify-between text-sm p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="font-medium text-slate-700">{lot.sharesSold} sh @ {formatCurrency(lot.costBasis / lot.sharesSold)}</span>
                      <span className={`${lot.gainLoss > 0 ? 'text-rose-600' : 'text-emerald-600'} font-semibold`}>
                        {lot.gainLoss > 0 ? '+' : ''}{formatCurrency(lot.gainLoss)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FIFO Column */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 bg-slate-50 border-b border-slate-200">
                <h4 className="font-bold text-slate-800">FIFO Strategy (Default)</h4>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Cap Gains</p>
                    <p className="text-2xl font-bold text-slate-500">{formatCurrency(data.strategies.FIFO.totalCapitalGains)}</p>
                  </div>
                </div>
                
                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Lots to Sell:</p>
                <div className="space-y-2 opacity-75">
                  {data.strategies.FIFO.lotsSold.map((lot: any) => (
                    <div key={lot.lotId} className="flex justify-between text-sm p-3 bg-white rounded-lg border border-slate-100">
                      <span className="font-medium text-slate-500">{lot.sharesSold} sh @ {formatCurrency(lot.costBasis / lot.sharesSold)}</span>
                      <span className={`${lot.gainLoss > 0 ? 'text-rose-400' : 'text-emerald-400'} font-semibold`}>
                        {lot.gainLoss > 0 ? '+' : ''}{formatCurrency(lot.gainLoss)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
