import React, { useState } from 'react';
import { Flame, Target, TrendingUp, CalendarClock, Settings2, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function FIRESimulator() {
  const [params, setParams] = useState({
    currentAge: 30,
    currentNetWorth: 150000,
    monthlySavings: 2500,
    targetAnnualExpenses: 60000,
    withdrawalRate: 4.0
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/retirement/fire-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const json = await res.json();
      if (json.success) setResult(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleParamChange = (field: string, value: string) => {
    setParams(prev => ({ ...prev, [field]: Number(value) }));
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  // Axis tick formatter that scales by magnitude so small net-worth values
  // don't render as ".0M".
  const formatAxisValue = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-8">
      
      {/* Controls Panel */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Flame className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">FIRE Simulator</h2>
          </div>
          <p className="text-sm text-slate-500">Calculate your exact Financial Independence, Retire Early (FIRE) milestones using the 4% Rule.</p>
        </div>

        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-200 flex-1">
          <div className="flex items-center gap-2 mb-2 text-slate-700 font-bold border-b border-slate-200 pb-2">
            <Settings2 className="w-4 h-4" /> Parameters
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Current Age</label>
            <input 
              type="number" value={params.currentAge} onChange={(e) => handleParamChange('currentAge', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 outline-none focus:border-orange-500 font-semibold text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Current Net Worth ($)</label>
            <input 
              type="number" value={params.currentNetWorth} onChange={(e) => handleParamChange('currentNetWorth', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 outline-none focus:border-orange-500 font-semibold text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Monthly Savings ($)</label>
            <input 
              type="number" value={params.monthlySavings} onChange={(e) => handleParamChange('monthlySavings', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 outline-none focus:border-orange-500 font-semibold text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Target Annual Expenses ($)</label>
            <input 
              type="number" value={params.targetAnnualExpenses} onChange={(e) => handleParamChange('targetAnnualExpenses', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 outline-none focus:border-orange-500 font-semibold text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1 flex justify-between">
              <span>Safe Withdrawal Rate (%)</span>
              <span className="text-orange-600">{params.withdrawalRate}%</span>
            </label>
            <input 
              type="range" min="2" max="6" step="0.1" value={params.withdrawalRate} onChange={(e) => handleParamChange('withdrawalRate', e.target.value)}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
              <span>FatFIRE (2-3%)</span>
              <span>Trinity Study (4%)</span>
              <span>LeanFIRE (5%+)</span>
            </div>
          </div>
        </div>

        <button 
          onClick={runSimulation}
          disabled={loading}
          className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Run Simulation Matrix'}
        </button>
      </div>

      {/* Chart Panel */}
      <div className="w-full lg:w-2/3 flex flex-col relative overflow-hidden bg-white border border-slate-200 rounded-2xl">
        {!result ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50 z-10 p-8 text-center">
            <TrendingUp className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-sm">Configure your parameters and run the simulation to chart your path to early retirement.</p>
          </div>
        ) : (
          <div className="p-6 h-full flex flex-col animate-in fade-in slide-in-from-right-4">
            
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-orange-600/80 uppercase tracking-wider mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> FI Number</p>
                <p className="text-2xl font-black text-orange-700">{formatCurrency(result.fireNumber)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> FI Age</p>
                <p className="text-2xl font-black text-slate-800">{result.targetAge} <span className="text-sm font-medium text-slate-400">({result.yearsToFI} yrs)</span></p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-wider mb-1 flex items-center gap-1"><Flame className="w-3 h-3" /> Success Rate</p>
                <p className="text-2xl font-black text-emerald-700">{result.successProbability}%</p>
              </div>
            </div>

            <div className="flex-1 min-h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.trajectory} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="age" 
                    axisLine={false} tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }} 
                    tickFormatter={(val) => `Age ${val}`}
                  />
                  <YAxis 
                    axisLine={false} tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={formatAxisValue}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Projected Net Worth']}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <ReferenceLine 
                    y={result.fireNumber} 
                    stroke="#f97316" 
                    strokeDasharray="4 4" 
                    label={{ position: 'insideTopLeft', value: 'FI Target', fill: '#c2410c', fontSize: 12, fontWeight: 'bold' }} 
                  />
                  <ReferenceLine 
                    x={result.targetAge} 
                    stroke="#cbd5e1" 
                    strokeDasharray="4 4" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="projectedNetWorth" 
                    stroke="#f97316" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorNetWorth)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
          </div>
        )}
      </div>

    </div>
  );
}
