import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Users, ShieldAlert, Loader2 } from 'lucide-react';

interface ExpenseApproval {
  id: string;
  initiator: string;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function ExpenseApprovalInbox() {
  const [inbox, setInbox] = useState<ExpenseApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared threshold mock value
  const threshold = 500.00; 

  const fetchInbox = async () => {
    try {
      const res = await fetch('/api/shared-accounts/approvals');
      const json = await res.json();
      if (json.success) setInbox(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const handleReview = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setProcessingId(id);
    setError(null);
    try {
      const res = await fetch('/api/shared-accounts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: id, action })
      });
      const json = await res.json();

      // Only remove from the inbox when the server confirms the review actually
      // succeeded. Otherwise keep the item so local UI state never silently
      // diverges from the server.
      if (res.ok && json.success) {
        setInbox(prev => prev.filter(exp => exp.id !== id));
      } else {
        const reason = json?.error || `Request failed with status ${res.status}`;
        setError(`Could not ${action.toLowerCase()} expense: ${reason}`);
        console.error("Expense review failed:", reason);
      }
    } catch (err) {
      setError(`Could not ${action.toLowerCase()} expense. Please try again.`);
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Joint Approval Inbox</h2>
            <p className="text-sm text-slate-500 mt-1">Review pending shared expenses over {formatCurrency(threshold)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-full border border-amber-100">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-sm text-amber-700">{inbox.length} Pending</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {inbox.length === 0 ? (
        <div className="text-center p-12 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
          <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700">Inbox Zero</h3>
          <p className="text-slate-500 text-sm mt-1">No joint expenses require your signature right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {inbox.map((exp) => (
            <div key={exp.id} className="flex flex-col sm:flex-row items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-colors gap-4">
              
              <div className="flex-1 w-full">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-slate-800">{exp.merchant}</h3>
                  <span className="text-xl font-black text-slate-900">{formatCurrency(exp.amount)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                  <span className="bg-slate-100 px-2 py-1 rounded-md">{exp.category}</span>
                  <span>Initiated by: <span className="font-bold text-slate-700">{exp.initiator}</span></span>
                  <span>{new Date(exp.date).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => handleReview(exp.id, 'REJECT')}
                  disabled={processingId === exp.id}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button 
                  onClick={() => handleReview(exp.id, 'APPROVE')}
                  disabled={processingId === exp.id}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {processingId === exp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
