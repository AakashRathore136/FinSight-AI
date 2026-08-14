import React, { useState, useEffect } from 'react';
import { Search, Sparkles, MapPin, Calendar, DollarSign, Loader2 } from 'lucide-react';

interface SearchResult {
  id: string;
  merchant: string;
  category: string;
  location: string;
  date: string;
  amount: number;
  similarityScore: number;
}

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce the user input to avoid spamming the embeddings API
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 600);
    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const performVectorSearch = async () => {
      setLoading(true);
      setHasSearched(true);
      try {
        const res = await fetch(`/api/transactions/semantic-search?query=${encodeURIComponent(debouncedQuery)}`);
        const json = await res.json();
        
        if (json.success) {
          setResults(json.data.results);
        }
      } catch (err) {
        console.error("Vector search failed", err);
      } finally {
        setLoading(false);
      }
    };

    performVectorSearch();
  }, [debouncedQuery]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100 min-h-[500px]">
      
      <div className="flex flex-col items-center mb-10 text-center">
        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Semantic Transaction Search</h2>
        <p className="text-slate-500 mt-2 max-w-lg">
          Powered by vector embeddings. Try searching naturally, like <br/>
          <span className="italic text-slate-700">"coffee I bought while in Seattle last year"</span>
        </p>
      </div>

      <div className="relative max-w-2xl mx-auto mb-8">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <Search className="w-5 h-5 text-indigo-500" />
        </div>
        <input 
          type="text" 
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Describe the transaction..."
          className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-lg shadow-inner"
        />
        {loading && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {hasSearched && !loading && results.length === 0 && (
          <div className="text-center p-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
            No semantic matches found. Try rewording your query.
          </div>
        )}

        {results.map((tx) => (
          <div key={tx.id} className="flex justify-between items-center p-5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group">
            
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800">{tx.merchant}</h3>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md">
                  {tx.category}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {tx.location}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(tx.date).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="text-xl font-black text-slate-900 flex items-center">
                {formatCurrency(tx.amount)}
              </span>
              {/* Show the vector similarity score */}
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-3 h-3" /> {(tx.similarityScore * 100).toFixed(1)}% Match
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}
