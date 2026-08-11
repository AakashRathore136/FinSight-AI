import React, { useState } from 'react';
import { Smartphone, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

export default function SmsOptInSettings() {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    if (enabled && phone.length < 10) {
      setStatus('error');
      return;
    }

    setSaving(true);
    setStatus('idle');
    
    // Simulate API call to save settings
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setSaving(false);
    setStatus('success');
    
    setTimeout(() => setStatus('idle'), 3000);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-red-50 text-red-600 rounded-xl">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Fraud Alerts</h2>
          <p className="text-sm text-slate-500">Immediate SMS notifications for suspicious activity.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <h3 className="font-bold text-slate-800">Enable SMS Alerts</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Receive a text when a transaction occurs in a foreign country or exceeds your threshold.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={enabled}
              onChange={() => setEnabled(!enabled)}
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {enabled && (
          <div className="animate-in slide-in-from-top-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Verified Phone Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <input 
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={`w-full pl-10 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${
                  status === 'error' ? 'border-red-500 bg-red-50' : 'border-slate-300'
                }`}
              />
            </div>
            {status === 'error' && <p className="text-xs text-red-500 mt-2">Please enter a valid phone number with country code.</p>}
          </div>
        )}

        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {status === 'success' && (
          <div className="flex items-center justify-center gap-2 text-green-600 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-semibold">Settings updated successfully</span>
          </div>
        )}
      </div>

    </div>
  );
}
