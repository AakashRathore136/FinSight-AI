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
// `years` by simulating many randomized return paths. This replaces the old
// fabricated scalar so the reported "Success Rate" has a real statistical basis
// (it now reflects return volatility and sequence-of-returns risk).
function runMonteCarloSuccessProbability(
  currentNetWorth: number,
  annualSavings0: number,
  fireNumber: number,
  inflationRate: number,
  paths = 1000,
  years = 40,
): number {
  let successes = 0;
  for (let p = 0; p < paths; p++) {
    let nw = currentNetWorth;
    let annualSavings = annualSavings0;
    let reached = false;
    for (let year = 1; year <= years; year++) {
      const annualReturn = gaussianRandom(0.07, 0.15);
      nw = nw * (1 + annualReturn) + annualSavings;
      annualSavings *= 1 + inflationRate; // contributions rise with inflation
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

    // Deterministic base projection. The ~7% real return already accounts for
    // inflation eroding investment growth; fixed contributions are grown by the
    // inflation rate each year so their future value is not overstated.
    const annualRealReturn = 0.07;
    const inflationRate = 0.03;
    let annualSavings = monthlySavings * 12;

    let simulatedNetWorth = currentNetWorth;
    const trajectory: SimulationYear[] = [];
    let yearsToFI = 0;
    let reachedFI = false;
    let targetAge = currentAge;

    for (let year = 1; year <= 40; year++) { // Project out up to 40 years
      simulatedNetWorth = (simulatedNetWorth * (1 + annualRealReturn)) + annualSavings;
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

      // Future contributions rise with inflation to preserve real value.
      annualSavings *= 1 + inflationRate;
    }

    // Real Monte-Carlo: empirical probability of reaching the FIRE number across
    // 1000 randomized return paths (no fabricated formula).
    const successProbability = runMonteCarloSuccessProbability(
      currentNetWorth,
      monthlySavings * 12,
      fireNumber,
      inflationRate,
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
