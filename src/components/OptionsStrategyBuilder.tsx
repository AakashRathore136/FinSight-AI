import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

type OptionLeg = {
  id: string;
  type: 'Call' | 'Put';
  action: 'Buy' | 'Sell';
  strike: number;
  premium: number;
  quantity: number;
};

export default function OptionsStrategyBuilder() {
  const [legs, setLegs] = useState<OptionLeg[]>([
    { id: '1', type: 'Call', action: 'Buy', strike: 150, premium: 5.50, quantity: 1 }
  ]);
  const [currentPrice, setCurrentPrice] = useState<number>(145);

  const addLeg = () => {
    setLegs([
      ...legs, 
      { id: Date.now().toString(), type: 'Call', action: 'Sell', strike: 160, premium: 2.00, quantity: 1 }
    ]);
  };

  const removeLeg = (id: string) => {
    setLegs(legs.filter(leg => leg.id !== id));
  };

  // Generate PnL curve data points
  const chartData = useMemo(() => {
    const data = [];
    if (legs.length === 0) return data;
    const minStrike = Math.min(...legs.map(l => l.strike)) * 0.7;
    const maxStrike = Math.max(...legs.map(l => l.strike)) * 1.3;
    
    // Generate 50 points between min and max
    const step = (maxStrike - minStrike) / 50;
    if (step <= 0) return data;

    for (let price = minStrike; price <= maxStrike; price += step) {
      let netPnL = 0;

      legs.forEach(leg => {
        let legPnL = 0;
        const premiumCost = leg.premium * 100 * leg.quantity;

        if (leg.type === 'Call') {
          const intrinsic = Math.max(0, price - leg.strike) * 100 * leg.quantity;
          legPnL = leg.action === 'Buy' ? intrinsic - premiumCost : premiumCost - intrinsic;
        } else {
          const intrinsic = Math.max(0, leg.strike - price) * 100 * leg.quantity;
          legPnL = leg.action === 'Buy' ? intrinsic - premiumCost : premiumCost - intrinsic;
        }
        
        netPnL += legPnL;
      });

      data.push({
        price: parseFloat(price.toFixed(2)),
        profit: parseFloat(netPnL.toFixed(2))
      });
    }

    return data;
  }, [legs]);

  return (
    <div className="w-full bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Options Strategy Builder</h2>
          <p className="text-sm text-slate-500">Simulate complex multi-leg trades and visualize payoff at expiration.</p>
        </div>
        <button 
          onClick={addLeg}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
        >
          + Add Leg
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Legs Configurator */}
        <div className="lg:col-span-1 space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {legs.map((leg, idx) => (
            <div key={leg.id} className="p-4 border border-gray-100 rounded-lg bg-gray-50 relative">
              <button 
                onClick={() => removeLeg(leg.id)}
                className="absolute top-2 right-2 text-red-400 hover:text-red-600 font-bold"
              >
                &times;
              </button>
              <h4 className="font-semibold text-gray-700 mb-2">Leg {idx + 1}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <label className="block text-xs text-gray-500">Action</label>
                  <select 
                    value={leg.action}
                    onChange={(e) => {
                      const newLegs = [...legs];
                      newLegs[idx].action = e.target.value as 'Buy' | 'Sell';
                      setLegs(newLegs);
                    }}
                    className="w-full p-1 border rounded"
                  >
                    <option>Buy</option>
                    <option>Sell</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Type</label>
                  <select 
                    value={leg.type}
                    onChange={(e) => {
                      const newLegs = [...legs];
                      newLegs[idx].type = e.target.value as 'Call' | 'Put';
                      setLegs(newLegs);
                    }}
                    className="w-full p-1 border rounded"
                  >
                    <option>Call</option>
                    <option>Put</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Strike ($)</label>
                  <input 
                    type="number" 
                    value={leg.strike}
                    onChange={(e) => {
                      const newLegs = [...legs];
                      newLegs[idx].strike = Number(e.target.value);
                      setLegs(newLegs);
                    }}
                    className="w-full p-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Premium ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={leg.premium}
                    onChange={(e) => {
                      const newLegs = [...legs];
                      newLegs[idx].premium = Number(e.target.value);
                      setLegs(newLegs);
                    }}
                    className="w-full p-1 border rounded"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payoff Chart */}
        <div className="lg:col-span-2 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis 
                dataKey="price" 
                type="number" 
                domain={['dataMin', 'dataMax']} 
                tickFormatter={(val) => `$${val}`} 
                label={{ value: 'Underlying Price at Expiration', position: 'bottom', offset: 0 }}
              />
              <YAxis 
                tickFormatter={(val) => `$${val}`}
                label={{ value: 'Net Profit / Loss', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [`$${value.toFixed(2)}`, "PnL"]}
                labelFormatter={(label: number) => `Stock Price: $${label.toFixed(2)}`}
              />
              <ReferenceLine y={0} stroke="#666" strokeWidth={2} />
              <ReferenceLine x={currentPrice} stroke="#3b82f6" strokeDasharray="3 3" label="Current Price" />
              <Line 
                type="monotone" 
                dataKey="profit" 
                stroke={(chartData[chartData.length - 1]?.profit || 0) >= 0 ? "#10b981" : "#ef4444"} 
                strokeWidth={3}
                dot={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
