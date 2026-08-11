import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck } from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface SpendingData {
  category: string;
  User: number;
  Peers: number;
  fullMark: number;
}

export default function PeerSpendingComparison() {
  const [data, setData] = useState<SpendingData[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Demo feature without a serverless endpoint (see #895): no request is
    // issued to the non-existent /api/insights/peer-comparison route.
    setData([]);
    setMeta(null);
    setError(null);
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="w-full max-w-2xl mx-auto p-8 text-center text-slate-500 animate-pulse">Aggregating cohort data...</div>;
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-red-50 border border-red-100 rounded-2xl text-red-700">
        <h3 className="font-bold mb-2">Privacy or Data Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Peer Comparison
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            See how your monthly spending compares to similar earners.
          </p>
        </div>
        
        {meta && (
          <div className="text-right">
            <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-1">
              Cohort: {meta.cohort}
            </span>
            <p className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3 text-green-500" />
              {meta.privacyStandard}
            </p>
          </div>
        )}
      </div>

      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis 
              dataKey="category" 
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} 
            />
            <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
            <Radar 
              name="You" 
              dataKey="User" 
              stroke="#3b82f6" 
              fill="#3b82f6" 
              fillOpacity={0.5} 
            />
            <Radar 
              name="Peer Average" 
              dataKey="Peers" 
              stroke="#94a3b8" 
              fill="#e2e8f0" 
              fillOpacity={0.6} 
            />
            <Tooltip 
              formatter={(value: number) => `$${value}`}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      
    </div>
  );
}
