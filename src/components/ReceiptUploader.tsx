import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, FileText } from 'lucide-react';

export default function ReceiptUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    setResult(null);
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG, PNG).');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB.');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      // Demo feature without a serverless endpoint (see #895): no request is
      // issued to the non-existent /api/receipt/scan route.
      setResult(null);
      setError('Receipt scanning is not available yet.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-2">Smart Receipt Scanner</h2>
      <p className="text-sm text-gray-500 mb-6">Upload a receipt to automatically extract and categorize the expense.</p>

      {!result ? (
        <>
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              accept="image/*" 
              onChange={handleFileChange}
            />
            <UploadCloud className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            {file ? (
              <p className="text-sm font-medium text-blue-600">{file.name}</p>
            ) : (
              <p className="text-sm text-gray-500">
                <span className="text-blue-500 font-medium">Click to upload</span> or drag and drop<br />
                <span className="text-xs">PNG, JPG up to 10MB</span>
              </p>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full mt-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isUploading ? (
              <span className="animate-pulse">Scanning Receipt...</span>
            ) : (
              'Process Receipt'
            )}
          </button>
        </>
      ) : (
        <div className="bg-green-50 border border-green-100 p-5 rounded-xl">
          <div className="flex items-center gap-2 text-green-700 mb-4">
            <CheckCircle className="w-5 h-5" />
            <h3 className="font-semibold">Receipt Processed Successfully</h3>
          </div>
          
          <div className="space-y-3 bg-white p-4 rounded-lg border border-green-100/50">
            <div className="flex justify-between items-center pb-2 border-b border-gray-50">
              <span className="text-xs text-gray-500 uppercase font-semibold">Merchant</span>
              <span className="text-sm font-medium text-gray-800">{result.merchant}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-50">
              <span className="text-xs text-gray-500 uppercase font-semibold">Category</span>
              <span className="text-sm font-medium text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{result.category}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-50">
              <span className="text-xs text-gray-500 uppercase font-semibold">Date</span>
              <span className="text-sm font-medium text-gray-800">{result.date}</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total Amount</span>
              <span className="text-lg font-bold text-slate-900">${result.amount.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => { setFile(null); setResult(null); }}
            className="w-full mt-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Scan Another Receipt
          </button>
        </div>
      )}
    </div>
  );
}
