import logger from "../lib/logger.js";

interface FIREParams {
  currentNetWorth: number;
  monthlySavings: number;
  targetAnnualExpenses: number;
  withdrawalRate: number; // e.g., 4.0 for 4% rule
}

interface SimulationYear {
  year: number;
  age: number;
  projectedNetWorth: number;
  isFI: boolean;
}

// Standard-normal sample via Box-Muller, used by the Monte-Carlo below.
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

// Estimate the empirical probability (0-100) of reaching `fireNumber` within
// 40 years across many randomized return paths.
function runMonteCarloSuccessProbability(
  currentNetWorth: number,
  monthlySavings: number,
  fireNumber: number,
  paths = 1000,
  years = 40,
): number {
  let successes = 0;
  for (let p = 0; p < paths; p++) {
    let nw = currentNetWorth;
    let reached = false;
    for (let year = 1; year <= years; year++) {
      const annualReturn = gaussianRandom(0.07, 0.15);
      const mr = annualReturn / 12;
      for (let m = 0; m < 12; m++) {
        nw = (nw + monthlySavings) * (1 + mr);
      }
      if (nw >= fireNumber) {
        reached = true;
        break;
      }
    }
    if (reached) successes++;
  }
  return parseFloat(((successes / paths) * 100).toFixed(1));
}

export async function runFIRESimulation(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentNetWorth, monthlySavings, targetAnnualExpenses, withdrawalRate, currentAge } = req.body;

    if (!currentNetWorth || !monthlySavings || !targetAnnualExpenses || !withdrawalRate || !currentAge) {
      return res.status(400).json({ error: "Missing required FIRE parameters." });
    }

    // FIRE Number Formula: Target Annual Expenses / (Withdrawal Rate / 100)
    const fireNumber = targetAnnualExpenses / (withdrawalRate / 100);

    // Run a deterministic projection using historical S&P 500 real averages
    // (~7% real return), compounded MONTHLY so contributions earn ~half a
    // year of return (matching gradual, monthly contributions). The previous
    // yearly lump-sum compounding overstated net worth.
    const annualRealReturn = 0.07;
    const monthlyRealReturn = annualRealReturn / 12;

    let simulatedNetWorth = currentNetWorth;
    const trajectory: SimulationYear[] = [];
    let yearsToFI = 0;
    let reachedFI = false;
    let targetAge = currentAge;

    for (let year = 1; year <= 40; year++) { // Project out up to 40 years
      for (let m = 0; m < 12; m++) {
        simulatedNetWorth = (simulatedNetWorth + monthlySavings) * (1 + monthlyRealReturn);
      }
      const isFI = simulatedNetWorth >= fireNumber;

      trajectory.push({
        year: new Date().getFullYear() + year,
        age: currentAge + year,
        projectedNetWorth: parseFloat(simulatedNetWorth.toFixed(2)),
        isFI
      });

      if (isFI && !reachedFI) {
        reachedFI = true;
        yearsToFI = year;
        targetAge = currentAge + year;
      }
    }

    // Real Monte-Carlo: estimate the probability of reaching the FIRE number by
    // simulating many randomized return paths (no fabricated scalar).
    const successProbability = runMonteCarloSuccessProbability(
      currentNetWorth,
      monthlySavings,
      fireNumber,
    );

    logger.info(`[FIRE_SIM] User ${user.uid} ran simulation. FI Target: $${fireNumber}. Years to FI: ${yearsToFI}`);

    res.json({
      success: true,
      data: {
        fireNumber: parseFloat(fireNumber.toFixed(2)),
        yearsToFI,
        targetAge,
        successProbability: parseFloat(successProbability.toFixed(1)),
        trajectory
      }
    });

  } catch (error: any) {
    logger.error("FIRE_SIM_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to run FIRE simulation matrix" });
  }
}
