import React, { useEffect, useState } from 'react';
import { Globe2, ArrowRight, RefreshCcw } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
  conversionRate: number;
  convertedBalance: number;
}

interface NetWorthData {
  baseCurrency: string;
  totalNetWorth: number;
  accounts: Account[];
  ratesTimestamp: string;
}

export default function MultiCurrencyNetWorth() {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  const fetchNetWorth = (base: string) => {
    setLoading(true);
    fetch(`/api/portfolio/net-worth?base=${base}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setData(json.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchNetWorth(baseCurrency);
  }, [baseCurrency]);

  // Helper to format currency symbol based on code
  const formatCurrency = (amount: number, code: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-indigo-600" />
            Global Net Worth
          </h2>
          <p className="text-sm text-slate-500 mt-1">Real-time FX normalization for international accounts.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2">Base</label>
          <select 
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            disabled={loading}
            className="bg-white border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none font-semibold shadow-sm"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="AUD">AUD (A$)</option>
          </select>
        </div>
      </div>

      {!data || loading ? (
        <div className="p-12 flex flex-col items-center justify-center text-slate-400">
          <RefreshCcw className="w-8 h-8 animate-spin mb-4 opacity-50" />
          <p>Fetching live FX rates and converting balances...</p>
        </div>
      ) : (
        <>
          <div className="text-center mb-10">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Total Aggregated Value</p>
            <h3 className="text-5xl font-black text-slate-900 tracking-tight">
              {formatCurrency(data.totalNetWorth, data.baseCurrency)}
            </h3>
            <p className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
              <RefreshCcw className="w-3 h-3" /> Rates updated {new Date(data.ratesTimestamp).toLocaleTimeString()}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Account Breakdown</h4>
            {data.accounts.map(acc => (
              <div key={acc.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow">
                
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800">{acc.name}</h4>
                  <p className="text-lg font-semibold text-slate-600 mt-1">
                    {formatCurrency(acc.balance, acc.currency)}
                  </p>
                </div>

                <div className="hidden sm:flex flex-col items-center justify-center px-6 text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1">Live Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{acc.currency}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-xs">{data.baseCurrency}</span>
                  </div>
                  <span className="text-xs mt-1 bg-white px-2 py-0.5 rounded border border-slate-200">{acc.conversionRate}</span>
                </div>

                <div className="flex-1 text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Normalized</p>
                  <p className="text-xl font-bold text-indigo-600">
                    {formatCurrency(acc.convertedBalance, data.baseCurrency)}
                  </p>
                </div>
                
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
