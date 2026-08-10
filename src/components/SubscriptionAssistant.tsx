import React, { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Mail, Trash2 } from 'lucide-react';

interface Subscription {
  id: string;
  providerName: string;
  lastBilled: number;
  date: string;
  actionUrl: string;
  actionType: 'web' | 'email';
}

export default function SubscriptionAssistant() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/subscriptions')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setSubscriptions(json.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch subscriptions", err);
        setLoading(false);
      });
  }, []);

  const handleCancelClick = (url: string) => {
    // Open the cancellation URL in a new tab, or trigger the native mail client
    window.open(url, '_blank');
  };

  if (loading) {
    return <div className="w-full max-w-3xl mx-auto p-8 text-center text-slate-500 animate-pulse">Scanning transaction history for recurring charges...</div>;
  }

  const totalMonthly = subscriptions.reduce((acc, sub) => acc + sub.lastBilled, 0);

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Active Subscriptions
          </h2>
          <p className="text-sm text-slate-500 mt-1">We found these recurring charges. Click to cancel them instantly.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400">Total Monthly</p>
          <p className="text-3xl font-black text-slate-900">${totalMonthly.toFixed(2)}</p>
        </div>
      </div>

      <div className="space-y-4">
        {subscriptions.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-xl text-slate-500">
            No active subscriptions found.
          </div>
        ) : (
          subscriptions.map((sub) => (
            <div key={sub.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-100 hover:shadow-md transition-all">
              
              <div>
                <h3 className="text-lg font-bold text-slate-800">{sub.providerName}</h3>
                <p className="text-sm text-slate-500">Last billed ${sub.lastBilled} on {sub.date}</p>
              </div>

              <button 
                onClick={() => handleCancelClick(sub.actionUrl)}
                className="px-4 py-2 bg-white text-red-600 border border-red-200 font-semibold rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Cancel
                {sub.actionType === 'web' ? <ExternalLink className="w-3 h-3 ml-1" /> : <Mail className="w-3 h-3 ml-1" />}
              </button>

            </div>
          ))
        )}
      </div>

    </div>
  );
}
