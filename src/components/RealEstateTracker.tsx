import React, { useEffect, useState } from 'react';
import { Home, TrendingUp, MapPin, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface PropertyData {
  property: {
    id: string;
    address: string;
    purchasePrice: number;
    purchaseDate: string;
    currentValue: number;
    lastUpdated: string;
    historicalData: { month: string; value: number }[];
  };
  metrics: {
    equity: number;
    appreciationPercent: number;
  };
}

export default function RealEstateTracker() {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolio/real-estate')
      .then(res => res.json())
      .then(json => {
        if (json.success) setData(json.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  if (loading || !data) {
    return (
      <div className="w-full max-w-4xl mx-auto p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p>Connecting to Automated Valuation Models (AVM)...</p>
      </div>
    );
  }

  const { property, metrics } = data;

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-slate-100 gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Home className="w-6 h-6 text-indigo-600" />
            Illiquid Asset Tracker
          </h2>
          <div className="flex items-center gap-2 mt-2 text-slate-500 text-sm">
            <MapPin className="w-4 h-4" />
            <span>{property.address}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-right min-w-[120px]">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider mb-1">Total Equity</p>
            <p className="text-xl font-black text-emerald-700">+{formatCurrency(metrics.equity)}</p>
          </div>
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-right min-w-[120px]">
            <p className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider mb-1">Current Value</p>
            <p className="text-xl font-black text-indigo-700">{formatCurrency(property.currentValue)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-4 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-semibold mb-1">Purchase Price</p>
          <p className="text-lg font-bold text-slate-800">{formatCurrency(property.purchasePrice)}</p>
          <p className="text-xs text-slate-400 mt-1">Bought in {new Date(property.purchaseDate).getFullYear()}</p>
        </div>
        <div className="p-4 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-semibold mb-1">Appreciation</p>
          <p className="text-lg font-bold text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> {metrics.appreciationPercent}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Since purchase</p>
        </div>
        <div className="p-4 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-semibold mb-1">Last AVM Sync</p>
          <p className="text-lg font-bold text-slate-800">{new Date(property.lastUpdated).toLocaleDateString()}</p>
          <p className="text-xs text-slate-400 mt-1">Auto-updates monthly</p>
        </div>
      </div>

      <div className="w-full h-[300px] mt-8">
        <h3 className="text-sm font-bold text-slate-600 mb-6 uppercase tracking-wider">6-Month Valuation Trend</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={property.historicalData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis 
              domain={['dataMin - 10000', 'dataMax + 10000']} 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={(val) => `$${val / 1000}k`}
              dx={-10}
            />
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
