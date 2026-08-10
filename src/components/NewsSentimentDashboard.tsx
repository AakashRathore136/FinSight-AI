import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SentimentAsset {
  ticker: string;
  score: number;
  classification: 'Bullish' | 'Bearish' | 'Neutral';
  articleCount: number;
  topHeadline: string;
  lastUpdated: string;
}

export default function NewsSentimentDashboard() {
  const [sentiments, setSentiments] = useState<SentimentAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolio/sentiment')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setSentiments(json.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load sentiment data", err);
        setLoading(false);
      });
  }, []);

  const getSentimentColor = (classification: string) => {
    switch(classification) {
      case 'Bullish': return 'text-green-600 bg-green-50 border-green-200';
      case 'Bearish': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSentimentIcon = (classification: string) => {
    switch(classification) {
      case 'Bullish': return <TrendingUp className="w-5 h-5" />;
      case 'Bearish': return <TrendingDown className="w-5 h-5" />;
      default: return <Minus className="w-5 h-5" />;
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Running NLP Analysis on Market News...</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Portfolio News Sentiment</h2>
        <p className="text-sm text-gray-500">Aggregated NLP sentiment analysis across financial news for your holdings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sentiments.map((asset) => (
          <div key={asset.ticker} className={`p-4 rounded-xl border ${getSentimentColor(asset.classification)}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold">{asset.ticker}</h3>
                <span className="text-xs uppercase font-semibold opacity-75 flex items-center gap-1 mt-1">
                  {getSentimentIcon(asset.classification)}
                  {asset.classification}
                </span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black">{asset.score > 0 ? '+' : ''}{asset.score}</div>
                <div className="text-xs opacity-75">Score (-1 to 1)</div>
              </div>
            </div>
            
            <div className="mt-4 pt-3 border-t border-black/10">
              <p className="text-xs font-semibold uppercase opacity-75 mb-1">Top Headline ({asset.articleCount} analyzed)</p>
              <p className="text-sm font-medium leading-tight line-clamp-2">"{asset.topHeadline}"</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
