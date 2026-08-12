import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

type CryptoPrices = {
  [symbol: string]: number;
};

interface CryptoWebSocketContextType {
  prices: CryptoPrices;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}

const CryptoWebSocketContext = createContext<CryptoWebSocketContextType>({
  prices: {},
  connectionStatus: 'disconnected'
});

export const useCryptoPrices = () => useContext(CryptoWebSocketContext);

export const CryptoWebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<CryptoPrices>({});
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to Binance WebSocket for real-time trade streams
    // We listen to BTC, ETH, and SOL for this example
    const wsUrl = 'wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade';
    
    const connect = () => {
      setConnectionStatus('connecting');
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnectionStatus('connected');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Binance format: data.s is symbol (e.g. BTCUSDT), data.p is price string
          if (data && data.s && data.p) {
            const symbol = data.s.replace('USDT', '');
            const price = parseFloat(data.p);
            
            // Use functional state update to avoid stale closures
            setPrices(prev => ({
              ...prev,
              [symbol]: price
            }));
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message", err);
        }
      };

      wsRef.current.onclose = () => {
        setConnectionStatus('disconnected');
        // Simple exponential backoff or auto-reconnect logic would go here
        setTimeout(connect, 5000); 
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <CryptoWebSocketContext.Provider value={{ prices, connectionStatus }}>
      {children}
    </CryptoWebSocketContext.Provider>
  );
};
