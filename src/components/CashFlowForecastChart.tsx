import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart
} from 'recharts';

export default function CashFlowForecastChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch predictive data
    fetch('/api/cash-flow-forecast')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load forecast data", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-4 text-center">Loading Prophet time-series projection...</div>;
  }

  return (
    <div className="w-full h-[400px] p-4 bg-white rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">90-Day Liquidity Forecast</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            minTickGap={30}
          />
          <YAxis 
            tickFormatter={(val) => `$${val.toLocaleString()}`}
          />
          <Tooltip 
            formatter={(value: number) => [`$${value.toLocaleString()}`, "Balance"]}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="upperBound" 
            fill="#8884d8" 
            stroke="none" 
            fillOpacity={0.1} 
            name="Confidence Interval"
          />
          <Area 
            type="monotone" 
            dataKey="lowerBound" 
            fill="#fff" 
            stroke="none" 
            fillOpacity={1} 
            name="Lower Bound (Hide)" 
            legendType="none" 
          />
          <Line 
            type="monotone" 
            dataKey="predictedBalance" 
            stroke="#8884d8" 
            strokeWidth={2} 
            dot={false} 
            name="Predicted Balance"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
