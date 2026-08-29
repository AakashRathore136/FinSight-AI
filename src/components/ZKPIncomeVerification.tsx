import React, { useState } from 'react';
import { Fingerprint, CheckCircle2, Copy, Shield, FileLock2, Loader2, ArrowRight } from 'lucide-react';

export default function ZKPIncomeVerification() {
  const [threshold, setThreshold] = useState<number>(5000);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Mocking the client-side snarkjs proof generation
  const generateZKP = async () => {
    setGenerating(true);
    setResult(null);
    setCopied(false);

    try {
      // 1. In production, we fetch actual user banking data locally from indexedDB/state
      // 2. We compile the inputs into a wasm circuit
      // 3. const { proof, publicSignals } = await snarkjs.groth16.fullProve({ income: 5500, threshold }, "circuit.wasm", "circuit_final.zkey");
      
      // Simulating heavy client-side mathematical proof generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockProof = {
        pi_a: ["123...", "456...", "789..."],
        pi_b: [["12...", "34..."], ["56...", "78..."]],
        pi_c: ["90...", "12...", "34..."],
        protocol: "groth16",
        curve: "bn128"
      };

      const mockSignals = [threshold.toString()];

      // 4. Send the mathematically generated proof to the server for verification
      const res = await fetch('/api/privacy/verify-income-zkp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof: mockProof, publicSignals: mockSignals, threshold })
      });

      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      }
    } catch (err) {
      console.error("ZKP Generation Failed", err);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.verificationUrl) {
      navigator.clipboard.writeText(result.verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8">
      
      {/* Configuration Panel */}
      <div className="w-full md:w-1/2 flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Fingerprint className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Zero-Knowledge Proofs</h2>
          </div>
          <p className="text-sm text-slate-500">
            Generate a cryptographic badge proving you meet an income requirement without exposing your bank statements or exact salary to landlords.
          </p>
        </div>

        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Income Threshold to Prove
            </label>
            <select 
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-semibold text-slate-700"
            >
              <option value="3000">Greater than $3,000 / month</option>
              <option value="5000">Greater than $5,000 / month</option>
              <option value="7500">Greater than $7,500 / month</option>
              <option value="10000">Greater than $10,000 / month</option>
            </select>
          </div>

          <button 
            onClick={generateZKP}
            disabled={generating}
            className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex justify-center items-center gap-2 mt-2"
          >
            {generating ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Generating SNARK Proof...</>
            ) : (
              <><FileLock2 className="w-5 h-5" /> Generate Proof Badge</>
            )}
          </button>

          <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1 mt-2">
            <Shield className="w-3 h-3" /> Powered by groth16 on bn128 curve
          </p>
        </div>
      </div>

      {/* Verification Output Panel */}
      <div className="w-full md:w-1/2 flex flex-col bg-slate-50 border border-slate-200 rounded-2xl relative overflow-hidden">
        {!result ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <Shield className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-sm">Select a threshold and generate a proof to get your verifiable sharing link.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col animate-in fade-in zoom-in-95">
            <div className="bg-emerald-600 p-8 text-white text-center rounded-t-2xl">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-100" />
              <h3 className="text-2xl font-black mb-1">Cryptographically Verified</h3>
<p className="text-emerald-100 font-medium">Income &gt; {formatCurrency(result.threshold)}/mo</p>            </div>
            
            <div className="p-6 flex-1 flex flex-col justify-center">
              <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Share this secure link with your landlord or creditor:</p>
              
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={result.verificationUrl}
                  className="flex-1 bg-white border border-slate-300 rounded-lg py-3 px-4 text-sm text-slate-500 font-mono outline-none"
                />
                <button 
                  onClick={copyToClipboard}
                  className="p-3 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg transition-colors shrink-0 flex items-center gap-1 font-bold text-sm"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-100 text-xs leading-relaxed flex items-start gap-3">
                <Fingerprint className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                <p>
                  <strong>How this works:</strong> When the third party clicks this link, they will see the green verified badge above. They will <strong>not</strong> see your exact salary, employer, or transaction history.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
