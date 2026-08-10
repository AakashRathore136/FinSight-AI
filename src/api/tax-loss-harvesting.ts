import logger from "../lib/logger.js";

// Represents a tax lot
interface TaxLot {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: Date;
}

export async function identifyTaxLossHarvesting(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // In a real application, we would pull the user's actual tax lots from Firestore
    // and live market prices from a data provider like Polygon.io or Alpaca.
    // Here we stub out the logic to demonstrate the FIFO calculation and Wash Sale checks.

    const mockLots: TaxLot[] = [
      { id: "lot_1", ticker: "ARKK", quantity: 50, purchasePrice: 120.0, purchaseDate: new Date("2021-08-15") },
      { id: "lot_2", ticker: "ARKK", quantity: 20, purchasePrice: 42.0, purchaseDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }, // Bought 10 days ago (Wash sale risk)
      { id: "lot_3", ticker: "SNOW", quantity: 10, purchasePrice: 350.0, purchaseDate: new Date("2021-11-20") },
    ];

    const currentPrices: Record<string, number> = {
      "ARKK": 45.0,
      "SNOW": 160.0
    };

    const userTaxRate = 0.24; // 24% marginal tax bracket
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const now = new Date();

    const opportunities = [];

    // Group lots by ticker
    const lotsByTicker: Record<string, TaxLot[]> = {};
    for (const lot of mockLots) {
      if (!lotsByTicker[lot.ticker]) lotsByTicker[lot.ticker] = [];
      lotsByTicker[lot.ticker].push(lot);
    }

    for (const [ticker, lots] of Object.entries(lotsByTicker)) {
      const currentPrice = currentPrices[ticker] || 0;
      
      // Wash Sale Rule Check: Did the user buy this asset within the last 30 days?
      const hasRecentPurchase = lots.some(lot => (now.getTime() - lot.purchaseDate.getTime()) <= thirtyDaysInMs);
      
      if (hasRecentPurchase) {
        opportunities.push({
          ticker,
          status: "Wash Sale Restricted",
          reason: "Similar asset purchased within 30 days. Selling now triggers a wash sale.",
          harvestableLoss: 0,
          potentialSavings: 0
        });
        continue;
      }

      // Calculate unrealized losses (using FIFO assumption if they sell oldest lots first)
      let harvestableLoss = 0;
      let sharesToSell = 0;

      for (const lot of lots) {
        if (currentPrice < lot.purchasePrice) {
          const lossPerShare = lot.purchasePrice - currentPrice;
          harvestableLoss += (lossPerShare * lot.quantity);
          sharesToSell += lot.quantity;
        }
      }

      if (harvestableLoss > 0) {
        opportunities.push({
          ticker,
          status: "Opportunity Identified",
          harvestableLoss: parseFloat(harvestableLoss.toFixed(2)),
          potentialSavings: parseFloat((harvestableLoss * userTaxRate).toFixed(2)),
          sharesToSell,
          reason: `Selling ${sharesToSell} shares can offset $${harvestableLoss.toFixed(2)} in capital gains.`
        });
      }
    }

    res.json({
      success: true,
      data: opportunities
    });

  } catch (error: any) {
    logger.error("TAX_LOSS_HARVESTING_ERROR", { message: error.message });
    res.status(500).json({ error: "Internal server error calculating tax lots" });
  }
}
