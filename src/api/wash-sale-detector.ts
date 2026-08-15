import logger from "../lib/logger.js";

interface Trade {
  id: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  date: string;
  realizedLoss?: number; // Only present on SELLs
}

interface WashSaleViolation {
  sellTradeId: string;
  buyTradeId: string;
  ticker: string;
  disallowedLoss: number;
  daysDifference: number;
}

export async function detectWashSales(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Mocking a ledger of trades for the user over the last few months
    const mockTrades: Trade[] = [
      { id: "tr_001", ticker: "TSLA", type: "BUY", shares: 50, price: 250.00, date: "2024-01-10" },
      // Sold for a loss on Feb 15 (-$2,500)
      { id: "tr_002", ticker: "TSLA", type: "SELL", shares: 50, price: 200.00, date: "2024-02-15", realizedLoss: 2500 }, 
      // Re-bought within 30 days (Wash Sale triggered!)
      { id: "tr_003", ticker: "TSLA", type: "BUY", shares: 25, price: 205.00, date: "2024-02-28" }, 
      
      { id: "tr_004", ticker: "AAPL", type: "BUY", shares: 100, price: 150.00, date: "2023-11-01" },
      // Sold for a loss on Dec 1 (-$1,000)
      { id: "tr_005", ticker: "AAPL", type: "SELL", shares: 100, price: 140.00, date: "2023-12-01", realizedLoss: 1000 },
      // No re-buy within 30 days, so this loss is safe to claim.
    ];

    const violations: WashSaleViolation[] = [];
    const DAY_IN_MS = 24 * 60 * 60 * 1000;

    // The Wash Sale Rule: If you sell a security at a loss and buy a "substantially identical" 
    // security within 30 days before OR after the sale, the loss is disallowed for tax purposes.
    const losses = mockTrades.filter(t => t.type === 'SELL' && t.realizedLoss && t.realizedLoss > 0);
    const buys = mockTrades.filter(t => t.type === 'BUY');

    for (const lossTrade of losses) {
      const lossDate = new Date(lossTrade.date).getTime();

      // Aggregate replacement shares across all matching buys within the 30-day window.
      const replacementShares = buys.reduce((sum, buyTrade) => {
        if (buyTrade.ticker !== lossTrade.ticker) return sum;
        const buyDate = new Date(buyTrade.date).getTime();
        const daysDiff = Math.abs((buyDate - lossDate) / DAY_IN_MS);
        return daysDiff <= 30 ? sum + buyTrade.shares : sum;
      }, 0);

      if (replacementShares > 0) {
        // The disallowed loss is capped at the realized loss (ratio never exceeds 1).
        const disallowedRatio = Math.min(replacementShares / lossTrade.shares, 1);
        const disallowedLoss = (lossTrade.realizedLoss || 0) * disallowedRatio;

        const nearestBuy = buys
          .filter(b => b.ticker === lossTrade.ticker)
          .reduce((closest, buyTrade) => {
            const buyDate = new Date(buyTrade.date).getTime();
            const daysDiff = Math.abs((buyDate - lossDate) / DAY_IN_MS);
            if (daysDiff > 30) return closest;
            return !closest || daysDiff < Math.abs((new Date(closest.date).getTime() - lossDate) / DAY_IN_MS)
              ? buyTrade
              : closest;
          }, null as Trade | null);

        violations.push({
          sellTradeId: lossTrade.id,
          buyTradeId: nearestBuy ? nearestBuy.id : "",
          ticker: lossTrade.ticker,
          disallowedLoss,
          daysDifference: nearestBuy
            ? Math.round(Math.abs((new Date(nearestBuy.date).getTime() - lossDate) / DAY_IN_MS))
            : 0
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalViolations: violations.length,
        totalDisallowedLosses: violations.reduce((acc, v) => acc + v.disallowedLoss, 0),
        violations
      }
    });

  } catch (error: any) {
    logger.error("WASH_SALE_DETECT_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to run wash sale detection engine" });
  }
}
