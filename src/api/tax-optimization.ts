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

    // Mock database fetch of user's tax lots, keyed by ticker so the requested
    // symbol is actually used instead of always falling back to AAPL.
    const requestedTicker = String(ticker).toUpperCase();
    const mockLotsByTicker: Record<string, TaxLot[]> = {
      AAPL: [
        { id: "lot_1", ticker: "AAPL", shares: 10, purchasePrice: 150.00, purchaseDate: "2021-05-10" },
        { id: "lot_1b", ticker: "AAPL", shares: 15, purchasePrice: 175.50, purchaseDate: "2022-08-15" },
        { id: "lot_1c", ticker: "AAPL", shares: 5, purchasePrice: 195.00, purchaseDate: "2023-11-01" },
        { id: "lot_1d", ticker: "AAPL", shares: 20, purchasePrice: 165.25, purchaseDate: "2023-01-20" },
      ],
      MSFT: [
        { id: "lot_2", ticker: "MSFT", shares: 12, purchasePrice: 280.00, purchaseDate: "2021-03-15" },
        { id: "lot_2b", ticker: "MSFT", shares: 8, purchasePrice: 310.75, purchaseDate: "2022-09-01" },
      ],
      TSLA: [
        { id: "lot_3", ticker: "TSLA", shares: 5, purchasePrice: 210.00, purchaseDate: "2022-01-10" },
        { id: "lot_3b", ticker: "TSLA", shares: 10, purchasePrice: 245.50, purchaseDate: "2023-06-20" },
      ],
    };

    const mockLots = mockLotsByTicker[requestedTicker];
    if (!mockLots || mockLots.length === 0) {
      return res.status(400).json({ error: `No tax lots found for ticker ${requestedTicker}.` });
    }

    // Mock current market price, keyed by ticker
    const currentPriceByTicker: Record<string, number> = {
      AAPL: 185.00,
      MSFT: 330.00,
      TSLA: 240.00,
    };
    const currentPrice = currentPriceByTicker[requestedTicker] ?? 100.00;
    const totalAvailableValue = mockLots.reduce((acc, lot) => acc + (lot.shares * currentPrice), 0);

    if (targetLiquidationAmount > totalAvailableValue) {
      return res.status(400).json({ error: "Insufficient balance to meet liquidation target." });
    }

    // Optimization Strategies

    // 1. FIFO (First In, First Out)
    const lotsFIFO = [...mockLots].sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
    const resultFIFO = calculateLiquidation(lotsFIFO, targetLiquidationAmount, currentPrice, 'FIFO');

    // 2. LIFO (Last In, First Out)
    const lotsLIFO = [...mockLots].sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
    const resultLIFO = calculateLiquidation(lotsLIFO, targetLiquidationAmount, currentPrice, 'LIFO');

    // 3. HIFO (Highest In, First Out) - Minimizes Capital Gains
    const lotsHIFO = [...mockLots].sort((a, b) => b.purchasePrice - a.purchasePrice);
    const resultHIFO = calculateLiquidation(lotsHIFO, targetLiquidationAmount, currentPrice, 'HIFO');

    // Use the user's effective capital-gains rate when supplied, otherwise default to 15%.
    const taxRate = typeof req.body?.taxRate === 'number' && req.body.taxRate >= 0 ? req.body.taxRate : 15;
    const taxRateDecimal = taxRate / 100;

    // Choose the strategy with the lowest total capital gains across all three strategies.
    const strategyResults: OptimizationResult[] = [resultFIFO, resultLIFO, resultHIFO];
    const recommendedStrategy = strategyResults.reduce((best, r) =>
      r.totalCapitalGains < best.totalCapitalGains ? r : best
    , strategyResults[0]).strategy;

    const maxGains = Math.max(...strategyResults.map(r => r.totalCapitalGains));
    const minGains = Math.min(...strategyResults.map(r => r.totalCapitalGains));

    res.json({
      success: true,
      data: {
        ticker: requestedTicker,
        currentPrice,
        targetLiquidationAmount,
        strategies: {
          FIFO: resultFIFO,
          LIFO: resultLIFO,
          HIFO: resultHIFO
        },
        recommendedStrategy,
        taxSavingsEstimated: Math.max(0, maxGains - minGains) * taxRateDecimal
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
