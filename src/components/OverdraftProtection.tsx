import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck, CalendarClock, TrendingDown, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface ProjectionData {
  currentBalance: number;
  overdraftRiskDetected: boolean;
  firstOverdraftDate: string | null;
  projections: {
    date: string;
    projectedBalance: number;
    expectedExpenses: { name: string; amount: number }[];
    isOverdraftRisk: boolean;
  }[];
}

export default function OverdraftProtection() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjections = async () => {
      try {
        const res = await fetch('/api/liquidity/predict-overdraft');
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) {
        console.error("Failed to fetch overdraft projections", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjections();
  }, []);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading || !data) {
    return (
      <div className="w-full max-w-4xl mx-auto p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500 mb-4" />
        <p>Running Prophet Time-Series Cash Flow Models...</p>
      </div>
    );
  }

  // Format data for Recharts
  const chartData = [
    { date: 'Today', balance: data.currentBalance },
    ...data.projections.map(p => ({
      date: new Date(p.date).toLocaleDateString('en-US', { weekday: 'short' }),
      balance: p.projectedBalance,
      isRisk: p.isOverdraftRisk
    }))
  ];

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-slate-700" />
            7-Day Liquidity Forecast
          </h2>
          <p className="text-sm text-slate-500 mt-1">AI predictive modeling to prevent NSF fees before they happen.</p>
        </div>
      </div>

      {data.overdraftRiskDetected ? (
        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl mb-8 flex items-start gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="p-2 bg-rose-100 text-rose-600 rounded-full shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-rose-800 mb-1">Overdraft Risk Detected</h3>
            <p className="text-rose-700 text-sm">
              Your projected balance is expected to drop below $0.00 on <span className="font-bold">{new Date(data.firstOverdraftDate!).toLocaleDateString()}</span>. 
              We recommend transferring funds immediately to avoid bank fees.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl mb-8 flex items-center gap-4">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-800 mb-1">Account Safe</h3>
            <p className="text-emerald-700 text-sm">No overdraft risks detected in the next 7 days.</p>
          </div>
        </div>
      )}

      <div className="w-full h-[350px] mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={data.overdraftRiskDetected ? '#f43f5e' : '#10b981'} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={data.overdraftRiskDetected ? '#f43f5e' : '#10b981'} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={(val) => `$${val}`}
            />
            <Tooltip 
              formatter={(value: number) => [formatCurrency(value), 'Projected Balance']}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Overdraft Zone', fill: '#ef4444', fontSize: 10 }} />
            <Area 
              type="monotone" 
              dataKey="balance" 
              stroke={data.overdraftRiskDetected ? '#f43f5e' : '#10b981'} 
              strokeWidth={3} 
              fillOpacity={1} 
              fill="url(#colorBalance)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
          <TrendingDown className="w-4 h-4" /> Upcoming Major Expenses
        </h3>
        <div className="space-y-3">
          {data.projections.filter(p => p.expectedExpenses.length > 0).map((day, idx) => (
            <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div>
                <p className="font-bold text-slate-800">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                <div className="text-sm text-slate-500 mt-1">
                  {day.expectedExpenses.map((exp, i) => (
                    <span key={i} className="block">{exp.name}</span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <span className="font-black text-rose-600 text-lg">
                  -{formatCurrency(day.expectedExpenses.reduce((sum, exp) => sum + exp.amount, 0))}
                </span>
              </div>
            </div>
          ))}
          {data.projections.filter(p => p.expectedExpenses.length > 0).length === 0 && (
            <p className="text-slate-500 italic text-sm">No major bills predicted this week.</p>
          )}
        </div>
      </div>

    </div>
  );
}
