import React, { useEffect, useState } from 'react';
import { Leaf, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

interface HoldingEsg {
  ticker: string;
  name: string;
  totalScore: number;
  environmentScore: number;
  socialScore: number;
  governanceScore: number;
  controversyLevel: number;
  rating: "Excellent" | "Average" | "Poor";
}

interface EsgPayload {
  holdings: HoldingEsg[];
  aggregateScore: number;
  aggregateRating: string;
}

const COLORS = {
  Excellent: '#10b981', // emerald-500
  Average: '#f59e0b',   // amber-500
  Poor: '#ef4444'       // red-500
};

export default function EsgDashboard() {
  const [esgData, setEsgData] = useState<EsgPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo feature without a serverless endpoint (see #895): no request is
    // issued to the non-existent /api/portfolio/esg-scores route.
    setEsgData(null);
    setLoading(false);
  }, []);

  if (loading || !esgData) {
    return (
      <div className="w-full max-w-4xl mx-auto p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-emerald-500" />
        <p>Analyzing portfolio environmental and social impact...</p>
      </div>
    );
  }

  // Aggregate for the Pie Chart
  const distribution = [
    { name: 'Green (Excellent)', value: esgData.holdings.filter(h => h.rating === 'Excellent').length, color: COLORS.Excellent },
    { name: 'Neutral (Average)', value: esgData.holdings.filter(h => h.rating === 'Average').length, color: COLORS.Average },
    { name: 'Red (Poor)', value: esgData.holdings.filter(h => h.rating === 'Poor').length, color: COLORS.Poor },
  ].filter(d => d.value > 0);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-slate-100 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Leaf className="w-6 h-6 text-emerald-500" />
            ESG Sustainability Score
          </h2>
          <p className="text-sm text-slate-500 mt-1">Environmental, Social, and Corporate Governance analysis of your investments.</p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div className="text-right">
            <p className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1">Overall Portfolio</p>
            <p className={`text-xl font-black ${
              esgData.aggregateRating === 'Excellent' ? 'text-emerald-600' :
              esgData.aggregateRating === 'Average' ? 'text-amber-600' : 'text-red-600'
            }`}>
              {esgData.aggregateScore} / 100
            </p>
          </div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-sm border border-slate-200">
            {esgData.aggregateRating === 'Excellent' ? <ShieldCheck className="w-6 h-6 text-emerald-500" /> :
             esgData.aggregateRating === 'Average' ? <Leaf className="w-6 h-6 text-amber-500" /> :
             <AlertTriangle className="w-6 h-6 text-red-500" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-1 bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-center items-center">
          <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-6">Asset Distribution</h3>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-4">
            {distribution.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></span>
                {d.value}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">Individual Holdings</h3>
          {esgData.holdings.sort((a, b) => b.totalScore - a.totalScore).map(asset => (
            <div key={asset.ticker} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div>
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  {asset.ticker}
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${
                    asset.rating === 'Excellent' ? 'bg-emerald-100 text-emerald-700' :
                    asset.rating === 'Average' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {asset.rating}
                  </span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">{asset.name}</p>
              </div>
              
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">E.S.G.</p>
                  <p className="text-sm font-semibold text-slate-700">{asset.environmentScore} • {asset.socialScore} • {asset.governanceScore}</p>
                </div>
                <div className="bg-slate-50 px-4 py-1 rounded-lg border border-slate-100">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Score</p>
                  <p className="text-lg font-black text-slate-900">{asset.totalScore}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
