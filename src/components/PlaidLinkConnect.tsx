import React, { useState } from 'react';

// In a real application, we would use:
// import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLinkConnect() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mock function to initiate the link flow
  const handleConnect = async () => {
    setLoading(true);
    try {
      // Demo feature without a serverless endpoint (see #895): no request is
      // issued to the non-existent /api/plaid/create-link-token route.
      setToken(null);
      alert("Bank syncing is not available yet. Plaid requires a backend endpoint.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
      <h3 className="text-xl font-bold mb-2 text-gray-800">Secure Bank Syncing</h3>
      <p className="text-gray-600 mb-4 text-sm">
        Connect your bank accounts securely via Plaid to automatically import your transactions and stop manual data entry.
      </p>
      
      <button 
        onClick={handleConnect}
        disabled={loading}
        className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {loading ? 'Initializing...' : 'Connect Bank Account'}
      </button>

      <div className="mt-4 text-xs text-gray-400">
        Secured by Plaid Integration
      </div>
    </div>
  );
}
