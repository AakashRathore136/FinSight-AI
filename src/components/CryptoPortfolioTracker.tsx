import React from 'react';
import { useCryptoPrices } from './CryptoWebSocketProvider';

// Mock user portfolio
const USER_PORTFOLIO = [
  { symbol: 'BTC', amount: 0.15 },
  { symbol: 'ETH', amount: 2.5 },
  { symbol: 'SOL', amount: 45.0 }
];

export default function CryptoPortfolioTracker() {
  const { prices, connectionStatus } = useCryptoPrices();

  const totalValue = USER_PORTFOLIO.reduce((acc, asset) => {
    const currentPrice = prices[asset.symbol] || 0;
    return acc + (currentPrice * asset.amount);
  }, 0);

  return (
    <div className="w-full max-w-2xl bg-slate-900 rounded-2xl shadow-lg border border-slate-700 overflow-hidden text-white p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Crypto Portfolio</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-400 text-sm">Live Feed</span>
            <span className="flex h-3 w-3 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionStatus === 'connected' ? 'bg-green-400' : 'bg-yellow-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                connectionStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'
              }`}></span>
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400 uppercase tracking-wider font-semibold">Total Value</p>
          <p className="text-3xl font-bold tabular-nums">${totalValue > 0 ? totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</p>
        </div>
      </div>

      <div className="space-y-3">
        {USER_PORTFOLIO.map(asset => {
          const price = prices[asset.symbol];
          const value = price ? price * asset.amount : 0;
          
          return (
            <div key={asset.symbol} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
                  {asset.symbol.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold">{asset.symbol}</h4>
                  <p className="text-sm text-slate-400">{asset.amount} Coins</p>
                </div>
              </div>
              <div className="text-right tabular-nums">
                <p className="font-semibold text-lg">${value > 0 ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</p>
                <p className="text-sm text-slate-400">
                  {price ? `@ $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Loading...'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
