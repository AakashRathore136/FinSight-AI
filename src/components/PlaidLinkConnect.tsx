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
      const response = await fetch('/api/plaid/create-link-token', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setToken(data.link_token);
        // Here we would configure the react-plaid-link component with the token
        console.log("Mock Plaid Link Token generated:", data.link_token);
        alert(`Plaid Link Initiated. Mock Token: ${data.link_token}`);
      }
    } catch (err) {
      console.error("Failed to connect bank", err);
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
