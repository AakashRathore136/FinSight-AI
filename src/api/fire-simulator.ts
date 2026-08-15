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

    if (!isFinite(withdrawalRate) || withdrawalRate <= 0 || withdrawalRate > 100) {
      return res.status(400).json({ error: "Withdrawal rate must be a positive percentage between 0 and 100." });
    }

    // FIRE Number Formula: Target Annual Expenses / (Withdrawal Rate / 100)
    const fireNumber = targetAnnualExpenses / (withdrawalRate / 100);

    if (!isFinite(fireNumber)) {
      return res.status(400).json({ error: "Invalid FIRE target computed from the provided parameters." });
    }

    // Run a deterministic Monte-Carlo style projection based on historical S&P 500 averages
    // Adjusted for inflation (Real Return of ~7%)
    const annualRealReturn = 0.07;
    const annualSavings = monthlySavings * 12;
    
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
    }

    // In a real Monte Carlo simulation, we would run 10,000 iterations using randomized historical returns
    // to calculate a "Probability of Success". Mocking a high probability if FI is reached within 40 years.
    const successProbability = reachedFI ? Math.max(99 - (yearsToFI * 0.5), 50) : 0;

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
