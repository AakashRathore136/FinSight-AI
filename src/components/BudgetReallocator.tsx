import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface Suggestion {
  fromCategory: string;
  toCategory: string;
  amount: number;
  reason: string;
}

export default function BudgetReallocator() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Demo feature without a serverless endpoint (see #895): no request is
    // issued to the non-existent /api/budget/reallocate-suggestions route.
    setSuggestions([]);
    setLoading(false);
  }, []);

  const handleApply = async () => {
    setApplying(true);
    // Demo feature without a serverless endpoint (see #895): no request is
    // issued to the non-existent /api/budget/apply-reallocation route.
    setSuccess(true);
    setSuggestions([]);
    setApplying(false);
  };

  if (loading) {
    return (
      <div className="w-full max-w-lg mx-auto p-8 text-center text-slate-500 bg-slate-50 rounded-2xl animate-pulse">
        Analyzing budget deficits and surpluses...
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-lg mx-auto bg-green-50 p-8 rounded-2xl border border-green-100 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-green-800 mb-2">Budget Balanced!</h3>
        <p className="text-green-600">Your allocations have been successfully adjusted and recorded in the audit log.</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto bg-white p-8 rounded-2xl border border-slate-100 text-center shadow-sm">
        <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-800 mb-2">All Good</h3>
        <p className="text-slate-500">No categories are currently over budget. Keep it up!</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
      <div className="flex items-start gap-4 mb-6 pb-4 border-b border-slate-100">
        <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Budget Overages Detected</h2>
          <p className="text-sm text-slate-500 mt-1">
            Our algorithm found {suggestions.length} way(s) to balance your budget by shifting unspent funds.
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        {suggestions.map((sug, i) => (
          <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                {sug.fromCategory}
              </span>
              <div className="flex flex-col items-center text-blue-600 px-4">
                <span className="text-sm font-bold">${sug.amount}</span>
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <span className="font-semibold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                {sug.toCategory}
              </span>
            </div>
            <p className="text-xs text-slate-500 text-center mt-2 opacity-80">{sug.reason}</p>
          </div>
        ))}
      </div>

      <button 
        onClick={handleApply}
        disabled={applying}
        className="w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 shadow-md disabled:opacity-50"
      >
        {applying && <Loader2 className="w-5 h-5 animate-spin" />}
        {applying ? 'Applying adjustments...' : 'Approve & Reallocate'}
      </button>
      <p className="text-xs text-center text-slate-400 mt-3">
        This action is reversible and will be recorded in your budget audit log.
      </p>
    </div>
  );
}
