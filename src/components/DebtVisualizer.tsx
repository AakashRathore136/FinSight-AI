import React, { useState } from 'react';
import { TrendingDown, Calculator, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Debt {
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
}

export default function DebtVisualizer() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [extraPayment, setExtraPayment] = useState<number>(200);

  const [debts, setDebts] = useState<Debt[]>([
    { name: 'Visa Credit Card', balance: 4500, interestRate: 22.9, minimumPayment: 110 },
    { name: 'Student Loan', balance: 18000, interestRate: 5.5, minimumPayment: 250 },
    { name: 'Auto Loan', balance: 12500, interestRate: 7.2, minimumPayment: 320 }
  ]);

  const updateDebt = (index: number, field: keyof Debt, value: string) => {
    const newDebts = [...debts];
    newDebts[index] = { ...newDebts[index], [field]: field === 'name' ? value : Number(value) };
    setDebts(newDebts);
  };

  const addDebt = () => {
    setDebts([...debts, { name: 'New Debt', balance: 1000, interestRate: 15.0, minimumPayment: 50 }]);
  };

  const removeDebt = (index: number) => {
    setDebts(debts.filter((_, i) => i !== index));
  };

  const calculateSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planning/debt-snowball', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debts, extraPayment })
      });
      const json = await res.json();
      if (json.success) setResult(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  // Normalize data for Recharts (merge both trajectories into one array by month index)
  let chartData: any[] = [];
  if (result) {
    const maxMonths = Math.max(result.snowball.trajectory.length, result.avalanche.trajectory.length);
    for (let i = 0; i < maxMonths; i++) {
      chartData.push({
        month: `Month ${i}`,
        snowball: result.snowball.trajectory[i] || 0,
        avalanche: result.avalanche.trajectory[i] || 0
      });
    }
  }

  const interestSaved = result ? result.snowball.totalInterestPaid - result.avalanche.totalInterestPaid : 0;
  const monthsSaved = result ? result.snowball.monthsToFreedom - result.avalanche.monthsToFreedom : 0;

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-8">
      
      {/* Configuration Panel */}
      <div className="w-full lg:w-1/2 flex flex-col">
        <div className="mb-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingDown className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Debt Freedom Planner</h2>
          </div>
          <p className="text-sm text-slate-500">
            Visualize the exact month you become debt-free by comparing the psychological Snowball method vs the mathematical Avalanche method.
          </p>
        </div>

        <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2">
          {debts.map((debt, idx) => (
            <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl relative group">
              <button 
                onClick={() => removeDebt(idx)}
                className="absolute top-2 right-2 w-6 h-6 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-100 hover:text-rose-600"
              >
                ×
              </button>
              
              <input 
                type="text" value={debt.name} onChange={(e) => updateDebt(idx, 'name', e.target.value)}
                className="w-full bg-transparent font-bold text-slate-700 outline-none mb-3 border-b border-slate-200 focus:border-indigo-500 transition-colors pb-1"
              />
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Balance ($)</label>
                  <input type="number" value={debt.balance} onChange={(e) => updateDebt(idx, 'balance', e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">APR (%)</label>
                  <input type="number" step="0.1" value={debt.interestRate} onChange={(e) => updateDebt(idx, 'interestRate', e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Min. Pay ($)</label>
                  <input type="number" value={debt.minimumPayment} onChange={(e) => updateDebt(idx, 'minimumPayment', e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-sm" />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addDebt} className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 font-bold rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-colors text-sm">
            + Add Another Debt
          </button>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl mb-6">
          <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider block mb-2 flex items-center justify-between">
            <span>Extra Monthly Payment Capacity</span>
            <span className="text-indigo-600 bg-white px-2 py-0.5 rounded shadow-sm">{formatCurrency(extraPayment)} / mo</span>
          </label>
          <input 
            type="range" min="0" max="2000" step="50" value={extraPayment} onChange={(e) => setExtraPayment(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <p className="text-[10px] text-indigo-600/80 mt-2 text-center">Drag to see how a little extra cash drastically reduces your timeline.</p>
        </div>

        <button 
          onClick={calculateSchedules} disabled={loading || debts.length === 0}
          className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Calculator className="w-5 h-5" /> Calculate Freedom Date</>}
        </button>
      </div>

      {/* Results Panel */}
      <div className="w-full lg:w-1/2 flex flex-col bg-slate-50 border border-slate-200 rounded-2xl relative overflow-hidden p-6">
        {!result ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/80 z-10 p-8 text-center">
            <TrendingDown className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-sm">Add your debts and click calculate to generate your amortization schedule.</p>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 h-full flex flex-col">
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center relative overflow-hidden group hover:border-indigo-400 transition-colors">
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400"></div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-1">Snowball (Psychological)</h3>
                <p className="text-xl font-black text-slate-800">{result.snowball.monthsToFreedom} <span className="text-sm font-medium text-slate-500">months</span></p>
                <p className="text-xs text-rose-500 mt-1 font-semibold">{formatCurrency(result.snowball.totalInterestPaid)} interest</p>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center relative overflow-hidden group hover:border-emerald-400 transition-colors">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400"></div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-1">Avalanche (Mathematical)</h3>
                <p className="text-xl font-black text-slate-800">{result.avalanche.monthsToFreedom} <span className="text-sm font-medium text-slate-500">months</span></p>
                <p className="text-xs text-rose-500 mt-1 font-semibold">{formatCurrency(result.avalanche.totalInterestPaid)} interest</p>
              </div>
            </div>

            {interestSaved > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-start gap-3 mb-6">
                <Sparkles className="w-6 h-6 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">Avalanche is Optimal</p>
                  <p className="text-xs text-emerald-700 mt-1">By prioritizing high-interest debt first, you will save <span className="font-bold">{formatCurrency(interestSaved)}</span> and be debt-free <span className="font-bold">{monthsSaved} months earlier</span> than the Snowball method.</p>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAvalanche" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickCount={5} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="snowball" name="Snowball Balance" stroke="#818cf8" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="avalanche" name="Avalanche Balance" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorAvalanche)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
          </div>
        )}
      </div>

    </div>
  );
}
