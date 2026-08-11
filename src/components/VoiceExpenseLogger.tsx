import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Check } from 'lucide-react';

// Extend window for Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceExpenseLogger() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setError("Microphone error or permission denied.");
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setError("Web Speech API is not supported in this browser.");
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      setSuccessData(null);
      setError(null);
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        // Handle race conditions where start is called while already started
        console.error(e);
      }
    }
  };

  const processTranscript = async () => {
    if (!transcript) return;
    
    setIsProcessing(true);
    setError(null);
    setSuccessData(null);

    try {
      // Demo feature without a serverless endpoint (see #895): no request is
      // issued to the non-existent /api/expenses/voice route.
      setSuccessData(null);
      setError("Voice expense logging is not available yet.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      
      {/* Popover UI */}
      {(transcript || isListening || successData || error) && (
        <div className="bg-white w-72 rounded-2xl shadow-xl border border-gray-200 p-4 transform transition-all animate-in slide-in-from-bottom-4">
          
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          
          {!successData ? (
            <>
              <p className="text-sm text-gray-500 font-medium mb-1">
                {isListening ? "Listening..." : "Transcript"}
              </p>
              <div className="bg-gray-50 rounded-lg p-3 min-h-[60px] text-gray-800 text-sm border border-gray-100">
                {transcript || (isListening ? "" : "Tap the mic and speak...")}
                {isListening && <span className="animate-pulse">_</span>}
              </div>

              {transcript && !isListening && (
                <button 
                  onClick={processTranscript}
                  disabled={isProcessing}
                  className="w-full mt-3 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 flex justify-center items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isProcessing ? "Processing..." : "Log Expense"}
                </button>
              )}
            </>
          ) : (
            <div className="text-center">
              <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6" />
              </div>
              <p className="font-bold text-gray-800">${successData.amount}</p>
              <p className="text-sm text-gray-600">{successData.merchant}</p>
              <span className="inline-block mt-2 text-xs font-semibold bg-gray-100 px-2 py-1 rounded text-gray-500">
                {successData.category}
              </span>
            </div>
          )}

        </div>
      )}

      {/* FAB (Floating Action Button) */}
      <button 
        onClick={toggleListen}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${
          isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>
      
    </div>
  );
}
