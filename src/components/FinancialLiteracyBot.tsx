import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Award, Loader2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

export default function FinancialLiteracyBot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'msg-1', sender: 'bot', text: "Hi there! I'm FinBot, your personal financial tutor. Ask me about compound interest, taxes, or budgeting, and you might earn some Knowledge Points!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text: userText }]);
    setLoading(true);

    try {
      // Demo feature without a serverless endpoint (see #895): no request is
      // issued to the non-existent /api/education/chat route.
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: "I'm not wired up to a knowledge base yet."
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-[600px]">
      
      {/* Header */}
      <div className="bg-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg">FinBot Tutor</h2>
            <p className="text-indigo-200 text-xs">Interactive Financial Literacy</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-indigo-700/50 px-3 py-1.5 rounded-full border border-indigo-500/30">
          <Award className="w-4 h-4 text-yellow-400" />
          <span className="font-bold text-sm">0 XP</span>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.sender === 'user' ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600'
            }`}>
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
              msg.sender === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'
            }`}>
              {/* Very basic markdown rendering for bold text ** */}
              {msg.text.split('**').map((chunk, i) => i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 text-indigo-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Typing...</span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100 shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a financial question..."
            className="w-full bg-slate-100 border-none rounded-full py-3.5 pl-5 pr-14 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
          />
          <button 
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>

    </div>
  );
}
