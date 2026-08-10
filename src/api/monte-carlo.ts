import logger from "../lib/logger.js";
// import { Worker } from "worker_threads";

// Helper to generate a random normal distribution using Box-Muller transform
function randomNormal(mean: number, stdDev: number) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return randomNormal(mean, stdDev); // resample between 0 and 1
  return (num - 0.5) * 10.0 * stdDev + mean;
}

export async function runMonteCarloSimulation(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // In a real high-performance app, this heavy loop would be offloaded 
    // to a Go/Rust microservice via gRPC, or run via Node worker_threads / Wasm.
    // For this demonstration, we run a simplified synchronous block.

    const { currentSavings, monthlyContribution, yearsToRetire } = req.body;
    
    if (isNaN(currentSavings) || isNaN(monthlyContribution) || isNaN(yearsToRetire)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const SIMULATION_RUNS = 10000;
    const MEAN_RETURN = 0.07; // 7% average annual return
    const VOLATILITY = 0.15; // 15% standard deviation

    const finalBalances: number[] = [];

    // Run 10k simulations
    for (let run = 0; run < SIMULATION_RUNS; run++) {
      let balance = currentSavings;
      
      for (let year = 1; year <= yearsToRetire; year++) {
        const annualReturn = randomNormal(MEAN_RETURN, VOLATILITY);
        balance = balance * (1 + annualReturn) + (monthlyContribution * 12);
      }
      
      finalBalances.push(balance);
    }

    // Sort to find percentiles
    finalBalances.sort((a, b) => a - b);
    
    const p10 = finalBalances[Math.floor(SIMULATION_RUNS * 0.10)];
    const p50 = finalBalances[Math.floor(SIMULATION_RUNS * 0.50)];
    const p90 = finalBalances[Math.floor(SIMULATION_RUNS * 0.90)];

    res.json({
      success: true,
      data: {
        percentile10: parseFloat(p10.toFixed(2)),
        percentile50: parseFloat(p50.toFixed(2)),
        percentile90: parseFloat(p90.toFixed(2)),
      },
      meta: {
        runs: SIMULATION_RUNS,
        volatility: VOLATILITY
      }
    });

  } catch (error: any) {
    logger.error("MONTE_CARLO_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to run Monte Carlo simulation" });
  }
}
