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

    // Use the authenticated user's real ledger when supplied; fall back to a
    // demo fixture only when no trades were provided (e.g. manual testing).
    const trades: Trade[] = Array.isArray(req.body?.trades) ? req.body.trades : [
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

    // The Wash Sale Rule: If you sell a security at a loss and buy a "substantially
    // identical" security within 30 days AFTER the sale, the loss is disallowed.
    // Only genuine replacement buys placed AFTER the loss are considered, so the
    // original acquisition that built the position is never flagged.
    const losses = trades.filter(t => t.type === 'SELL' && t.realizedLoss && t.realizedLoss > 0);
    const buys = trades.filter(t => t.type === 'BUY');

    for (const lossTrade of losses) {
      const lossDate = new Date(lossTrade.date).getTime();

      for (const buyTrade of buys) {
        if (buyTrade.ticker === lossTrade.ticker) {
          const buyDate = new Date(buyTrade.date).getTime();
          // Only count replacement buys occurring after the loss sale.
          if (buyDate <= lossDate) continue;
          const daysDiff = (buyDate - lossDate) / DAY_IN_MS;

          // If the buy is within the 30-day window after the sale.
          if (daysDiff <= 30) {

            // Disallowed loss = lesser of the pro-rated realized loss and the
            // actual cost of the replacement shares acquired.
            const replacedShares = Math.min(buyTrade.shares, lossTrade.shares);
            const replacementCost = replacedShares * buyTrade.price;
            const proRatedLoss = (lossTrade.realizedLoss || 0) * (replacedShares / lossTrade.shares);
            const disallowedLoss = Math.min(proRatedLoss, replacementCost);

            violations.push({
              sellTradeId: lossTrade.id,
              buyTradeId: buyTrade.id,
              ticker: lossTrade.ticker,
              disallowedLoss,
              daysDifference: Math.round(daysDiff)
            });
          }
        }
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
