import React, { useState } from 'react';
import { Settings, BarChart3, Loader2 } from 'lucide-react';

export default function MonteCarloRetirement() {
  const [params, setParams] = useState({
    currentSavings: 100000,
    monthlyContribution: 1500,
    yearsToRetire: 25,
  });
  
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Demo feature without a serverless endpoint (see #895): no request is
      // issued to the non-existent /api/retirement/monte-carlo route.
      setResults(null);
      setError("Simulation service is not available yet.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({
      ...params,
      [e.target.name]: Number(e.target.value)
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-8 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Monte Carlo Retirement Simulator</h2>
          <p className="text-sm text-slate-500 mt-1">Simulates 10,000 randomized market sequences to forecast probabilities of success.</p>
        </div>
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
          <BarChart3 className="w-6 h-6" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Controls */}
        <div className="lg:col-span-1 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Current Savings ($)</label>
            <input 
              type="number" 
              name="currentSavings"
              value={params.currentSavings}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Contribution ($)</label>
            <input 
              type="number" 
              name="monthlyContribution"
              value={params.monthlyContribution}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Years to Retirement</label>
            <input 
              type="number" 
              name="yearsToRetire"
              value={params.yearsToRetire}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>

          <button 
            onClick={runSimulation}
            disabled={loading}
            className="w-full mt-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? 'Running 10,000 iterations...' : 'Run Simulation'}
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center">
          {!results && !loading ? (
            <div className="text-center text-slate-400">
              <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Adjust parameters and click run to generate confidence intervals.</p>
            </div>
          ) : results ? (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Expected Outcome (50th Percentile)</h3>
                <p className="text-5xl font-black text-slate-900 mt-2">${results.percentile50.toLocaleString()}</p>
                <p className="text-sm text-slate-500 mt-1">Median scenario based on historical volatility.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-red-100 shadow-sm text-center">
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Poor Market (10th %)</h4>
                  <p className="text-xl font-bold text-slate-800">${results.percentile10.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">90% chance of beating this.</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm text-center">
                  <h4 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Great Market (90th %)</h4>
                  <p className="text-xl font-bold text-slate-800">${results.percentile90.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">10% chance of beating this.</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
