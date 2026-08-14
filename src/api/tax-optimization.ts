import logger from "../lib/logger.js";

interface TaxLot {
  id: string;
  ticker: string;
  shares: number;
  purchasePrice: number;
  purchaseDate: string;
}

interface OptimizationResult {
  strategy: 'FIFO' | 'LIFO' | 'HIFO';
  lotsSold: { lotId: string; sharesSold: number; costBasis: number; proceeds: number; gainLoss: number }[];
  totalProceeds: number;
  totalCostBasis: number;
  totalCapitalGains: number;
}

export async function optimizeTaxLots(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ticker, targetLiquidationAmount } = req.body;

    if (!ticker || !targetLiquidationAmount || targetLiquidationAmount <= 0) {
      return res.status(400).json({ error: "Invalid liquidation parameters" });
    }

    // Mock database fetch of user's tax lots for the requested ticker
    const mockLots: TaxLot[] = [
      { id: "lot_1", ticker: "AAPL", shares: 10, purchasePrice: 150.00, purchaseDate: "2021-05-10" },
      { id: "lot_2", ticker: "AAPL", shares: 15, purchasePrice: 175.50, purchaseDate: "2022-08-15" },
      { id: "lot_3", ticker: "AAPL", shares: 5, purchasePrice: 195.00, purchaseDate: "2023-11-01" },
      { id: "lot_4", ticker: "AAPL", shares: 20, purchasePrice: 165.25, purchaseDate: "2023-01-20" },
    ];

    // Mock current market price
    const currentPrice = 185.00; 
    const totalAvailableValue = mockLots.reduce((acc, lot) => acc + (lot.shares * currentPrice), 0);

    if (targetLiquidationAmount > totalAvailableValue) {
      return res.status(400).json({ error: "Insufficient balance to meet liquidation target." });
    }

    // Optimization Strategies
    
    // 1. FIFO (First In, First Out)
    const lotsFIFO = [...mockLots].sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
    const resultFIFO = calculateLiquidation(lotsFIFO, targetLiquidationAmount, currentPrice, 'FIFO');

    // 2. HIFO (Highest In, First Out) - Minimizes Capital Gains
    const lotsHIFO = [...mockLots].sort((a, b) => b.purchasePrice - a.purchasePrice);
    const resultHIFO = calculateLiquidation(lotsHIFO, targetLiquidationAmount, currentPrice, 'HIFO');

    res.json({
      success: true,
      data: {
        ticker,
        currentPrice,
        targetLiquidationAmount,
        strategies: {
          FIFO: resultFIFO,
          HIFO: resultHIFO
        },
        recommendedStrategy: resultHIFO.totalCapitalGains < resultFIFO.totalCapitalGains ? 'HIFO' : 'FIFO',
        taxSavingsEstimated: Math.max(0, resultFIFO.totalCapitalGains - resultHIFO.totalCapitalGains) * 0.15 // Assuming 15% Cap Gains Tax
      }
    });

  } catch (error: any) {
    logger.error("TAX_LOT_OPT_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to run tax-lot optimization engine" });
  }
}

// Helper function to process the sale across a sorted array of lots
function calculateLiquidation(sortedLots: TaxLot[], targetAmount: number, currentPrice: number, strategyName: 'FIFO' | 'LIFO' | 'HIFO'): OptimizationResult {
  let remainingTarget = targetAmount;
  const lotsSold = [];
  let totalCostBasis = 0;
  let totalCapitalGains = 0;
  let totalProceeds = 0;

  for (const lot of sortedLots) {
    if (remainingTarget <= 0) break;

    const lotValue = lot.shares * currentPrice;
    
    // If the lot is smaller than what we need, sell all of it
    // If it's larger, sell fractional shares to exactly meet the target
    const amountToSellFromLot = Math.min(lotValue, remainingTarget);
    const sharesToSell = amountToSellFromLot / currentPrice;
    const costBasisForSale = sharesToSell * lot.purchasePrice;
    const gainLoss = amountToSellFromLot - costBasisForSale;

    lotsSold.push({
      lotId: lot.id,
      sharesSold: parseFloat(sharesToSell.toFixed(4)),
      costBasis: parseFloat(costBasisForSale.toFixed(2)),
      proceeds: parseFloat(amountToSellFromLot.toFixed(2)),
      gainLoss: parseFloat(gainLoss.toFixed(2))
    });

    totalCostBasis += costBasisForSale;
    totalCapitalGains += gainLoss;
    totalProceeds += amountToSellFromLot;
    remainingTarget -= amountToSellFromLot;
  }

  return {
    strategy: strategyName,
    lotsSold,
    totalProceeds: parseFloat(totalProceeds.toFixed(2)),
    totalCostBasis: parseFloat(totalCostBasis.toFixed(2)),
    totalCapitalGains: parseFloat(totalCapitalGains.toFixed(2))
  };
}
