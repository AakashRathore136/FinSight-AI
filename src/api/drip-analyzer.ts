import logger from "../lib/logger.js";

interface ProjectionPoint {
  year: number;
  cashOutValue: number;
  dripValue: number;
}

export async function calculateDripProjection(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { principal = 10000, dividendYield = 4.5, annualGrowth = 6, years = 10 } = req.body;

    if (principal < 0 || dividendYield < 0 || annualGrowth < 0 || years <= 0) {
      return res.status(400).json({ error: "Invalid projection parameters" });
    }

    const projection: ProjectionPoint[] = [];

    // The logic simulates annual compounding
    let cashOutTotal = principal;
    let dripTotal = principal;

    for (let i = 0; i <= years; i++) {
      if (i === 0) {
        projection.push({ year: i, cashOutValue: principal, dripValue: principal });
        continue;
      }

      // 1. Cash Out Scenario: The underlying stock grows by `annualGrowth`, but dividends are extracted and not compounded
      const capitalGrowthCashOut = cashOutTotal * (annualGrowth / 100);
      cashOutTotal += capitalGrowthCashOut; // Dividends are assumed "lost" to consumption

      // 2. DRIP Scenario: The underlying stock grows AND dividends are reinvested to compound
      const capitalGrowthDrip = dripTotal * (annualGrowth / 100);
      const dividendReinvested = dripTotal * (dividendYield / 100);
      dripTotal += capitalGrowthDrip + dividendReinvested;

      projection.push({
        year: i,
        cashOutValue: Math.round(cashOutTotal),
        dripValue: Math.round(dripTotal)
      });
    }

    const lostWealthGap = Math.round(dripTotal - cashOutTotal);

    res.json({
      success: true,
      data: {
        projection,
        metrics: {
          lostWealthGap,
          finalCashOut: Math.round(cashOutTotal),
          finalDrip: Math.round(dripTotal)
        }
      }
    });

  } catch (error: any) {
    logger.error("DRIP_ANALYZER_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to calculate DRIP projection" });
  }
}
