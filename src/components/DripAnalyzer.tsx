import React, { useEffect, useState } from 'react';
import { Settings, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ProjectionData {
  projection: { year: number; cashOutValue: number; dripValue: number; }[];
  metrics: { lostWealthGap: number; finalCashOut: number; finalDrip: number; };
}

export default function DripAnalyzer() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [params, setParams] = useState({
    principal: 25000,
    dividendYield: 4.5,
    annualGrowth: 7.0,
    years: 15
  });

  const fetchProjection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/portfolio/drip-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const json = await response.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("Failed to fetch DRIP projection", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjection();
  }, [params.years]); // Auto-refresh if years change, otherwise rely on manual "Recalculate"

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-8">
      
      {/* Sidebar Controls */}
      <div className="w-full lg:w-1/3 bg-slate-50 p-6 rounded-2xl border border-slate-200 shrink-0">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-indigo-600" />
          DRIP Simulator
        </h2>
        
        <div className="space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Initial Portfolio ($)</label>
            <input 
              type="number"
              value={params.principal}
              onChange={(e) => setParams({...params, principal: Number(e.target.value)})}
              className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Dividend Yield (%)</label>
            <input 
              type="number" step="0.1"
              value={params.dividendYield}
              onChange={(e) => setParams({...params, dividendYield: Number(e.target.value)})}
              className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Stock Growth (%)</label>
            <input 
              type="number" step="0.1"
              value={params.annualGrowth}
              onChange={(e) => setParams({...params, annualGrowth: Number(e.target.value)})}
              className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Time Horizon (Years): {params.years}</label>
            <input 
              type="range" min="1" max="40"
              value={params.years}
              onChange={(e) => setParams({...params, years: Number(e.target.value)})}
              className="w-full accent-indigo-600"
            />
          </div>
          <button 
            onClick={fetchProjection}
            disabled={loading}
            className="w-full py-3 mt-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Recalculate Simulation'}
          </button>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!data ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1 bg-white border border-rose-200 p-5 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Lost Wealth Gap</p>
                <p className="text-3xl font-black text-slate-900">{formatCurrency(data.metrics.lostWealthGap)}</p>
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                  Wealth sacrificed by cashing out dividends.
                </p>
              </div>
              <div className="flex-1 bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-2xl shadow-md text-white">
                <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-1">Final DRIP Value</p>
                <p className="text-3xl font-black text-white">{formatCurrency(data.metrics.finalDrip)}</p>
                <p className="text-xs text-indigo-100 mt-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Total if reinvested over {params.years} years.
                </p>
              </div>
            </div>

            <div className="w-full flex-1 min-h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.projection} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dripColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="cashOutColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => `Yr ${v}`} />
                  <YAxis 
                    tickLine={false} axisLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                    tickFormatter={(val) => `$${val > 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                    width={60}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => `Year ${label}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '14px', fontWeight: 600, color: '#334155' }} />
                  <Area type="monotone" name="DRIP (Reinvested)" dataKey="dripValue" stroke="#4f46e5" strokeWidth={3} fill="url(#dripColor)" />
                  <Area type="monotone" name="Cash Out (Not Reinvested)" dataKey="cashOutValue" stroke="#94a3b8" strokeWidth={2} fill="url(#cashOutColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
