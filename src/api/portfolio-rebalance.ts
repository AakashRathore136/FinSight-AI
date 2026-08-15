import logger from "../lib/logger.js";

interface Asset {
  ticker: string;
  shares: number;
  currentPrice: number;
  targetPercentage: number; // e.g. 40.0 for 40%
}

interface RebalanceOrder {
  ticker: string;
  action: 'BUY' | 'SELL';
  shares: number;
  estimatedValue: number;
}

export async function calculateRebalance(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { assets } = req.body as { assets: Asset[] };

    if (!assets || assets.length === 0) {
      return res.status(400).json({ error: "No assets provided for rebalancing." });
    }

    // Ensure target percentages equal exactly 100%
    const totalTarget = assets.reduce((sum, a) => sum + a.targetPercentage, 0);
    if (Math.abs(totalTarget - 100) > 0.01) {
      return res.status(400).json({ error: `Target percentages must equal 100%. Currently: ${totalTarget}%` });
    }

    // Validate inputs: each asset must have a positive price to avoid divide-by-zero
    if (assets.some(a => !(a.currentPrice > 0))) {
      return res.status(400).json({ error: "Each asset must have a positive currentPrice." });
    }

    // 1. Calculate total portfolio value
    let totalValue = 0;
    const currentAllocations = assets.map(asset => {
      const value = asset.shares * asset.currentPrice;
      totalValue += value;
      return { ...asset, currentValue: value };
    });

    if (totalValue <= 0) {
      return res.status(400).json({ error: "Portfolio total value must be greater than zero." });
    }

    const orders: RebalanceOrder[] = [];
    let driftWarning = false;

    // 2. Compare current vs target and generate fractional orders
    const analysis = currentAllocations.map(asset => {
      const currentPercentage = (asset.currentValue / totalValue) * 100;
      const targetValue = totalValue * (asset.targetPercentage / 100);
      const valueDelta = targetValue - asset.currentValue;
      
      const percentageDrift = Math.abs(currentPercentage - asset.targetPercentage);
      if (percentageDrift >= 5.0) driftWarning = true; // Warn if any asset has drifted > 5%

      let action: 'BUY' | 'SELL' | null = null;
      let sharesToTrade = 0;

      if (Math.abs(valueDelta) > 0.01) {
        action = valueDelta > 0 ? 'BUY' : 'SELL';
        sharesToTrade = Math.abs(valueDelta) / asset.currentPrice;
        
        orders.push({
          ticker: asset.ticker,
          action,
          shares: parseFloat(sharesToTrade.toFixed(4)),
          estimatedValue: parseFloat(Math.abs(valueDelta).toFixed(2))
        });
      }

      return {
        ticker: asset.ticker,
        currentPercentage: parseFloat(currentPercentage.toFixed(2)),
        targetPercentage: asset.targetPercentage,
        valueDelta: parseFloat(valueDelta.toFixed(2))
      };
    });

    res.json({
      success: true,
      data: {
        totalPortfolioValue: parseFloat(totalValue.toFixed(2)),
        driftWarning,
        analysis,
        recommendedOrders: orders.sort((a, b) => b.estimatedValue - a.estimatedValue) // Largest trades first
      }
    });

  } catch (error: any) {
    logger.error("REBALANCE_ALGO_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to calculate portfolio rebalancing" });
  }
}
