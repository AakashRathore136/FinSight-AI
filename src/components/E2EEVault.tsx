import React, { useState, useRef } from 'react';
import { Lock, Shield, FileText, Upload, Key, CheckCircle2, Loader2 } from 'lucide-react';

interface StoredDoc {
  id: string;
  filename: string;
  uploadDate: string;
  status: string;
}

export default function E2EEVault() {
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PBKDF2 Key Derivation + AES-GCM Encryption running entirely in the browser
  const encryptFileClientSide = async (file: File, pass: string) => {
    // 1. Derive key from password using PBKDF2
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(pass), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    
    // In production, salt should be stored per-user. Mocking static salt for demo.
    const salt = enc.encode("finsight-static-salt-v1"); 
    
    const key = await window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    // 2. Read File as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 3. Encrypt using AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      arrayBuffer
    );

    return {
      ciphertextBuffer: ciphertext,
      ivBase64: btoa(String.fromCharCode(...iv))
    };
  };

  const handleUpload = async () => {
    if (!selectedFile || !password) return;
    
    try {
      // Step 1: Encrypt locally
      setEncrypting(true);
      const { ciphertextBuffer, ivBase64 } = await encryptFileClientSide(selectedFile, password);
      setEncrypting(false);

      // Convert buffer to base64 for JSON transport (in prod, use multipart form for large files)
      const cipherArray = Array.from(new Uint8Array(ciphertextBuffer));
      const ciphertextBase64 = btoa(String.fromCharCode.apply(null, cipherArray as unknown as number[]));

      // Step 2: Upload to server
      setUploading(true);
      const res = await fetch('/api/vault/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          fileSize: selectedFile.size,
          iv: ivBase64,
          ciphertextBase64
        })
      });

      const json = await res.json();
      if (json.success) {
        setDocs(prev => [json.data, ...prev]);
        setSelectedFile(null);
        // We do NOT clear the password state here so they can encrypt/decrypt more files in this session
      }
    } catch (err) {
      console.error("Encryption/Upload failed", err);
    } finally {
      setEncrypting(false);
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8">
      
      {/* Upload & Encryption Panel */}
      <div className="w-full md:w-1/2 flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">E2EE Document Vault</h2>
          </div>
          <p className="text-sm text-slate-500">
            Securely store W-2s and tax returns. Files are encrypted in your browser using AES-GCM before upload. The server never sees your unencrypted data.
          </p>
        </div>

        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
              <Key className="w-3 h-3" /> Master Vault Password
            </label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Used to derive your encryption key..."
              className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1.5">If you lose this password, your documents cannot be recovered.</p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              selectedFile ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-100'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile ? (
              <>
                <FileText className="w-8 h-8 text-indigo-500 mb-2" />
                <p className="font-semibold text-slate-700 text-sm text-center truncate max-w-full px-4">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 mt-1">Ready to encrypt</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <p className="font-semibold text-slate-600 text-sm">Click to select a document</p>
                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG (Max 10MB)</p>
              </>
            )}
          </div>

          <button 
            onClick={handleUpload}
            disabled={!selectedFile || !password || encrypting || uploading}
            className="w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {encrypting ? (
              <><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Encrypting locally...</>
            ) : uploading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Uploading Ciphertext...</>
            ) : (
              <><Lock className="w-5 h-5" /> Encrypt & Upload</>
            )}
          </button>
        </div>
      </div>

      {/* Stored Documents Panel */}
      <div className="w-full md:w-1/2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          Your Encrypted Vault ({docs.length})
        </h3>
        
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 border border-slate-100 rounded-2xl bg-slate-50/50">
            <Shield className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">Vault is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-slate-100 text-slate-500 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-bold text-slate-800 truncate">{doc.filename}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(doc.uploadDate).toLocaleString()}</p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" /> Secured
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
