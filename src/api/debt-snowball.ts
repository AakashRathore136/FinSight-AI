import logger from "../lib/logger.js";

interface Debt {
  name: string;
  balance: number;
  interestRate: number; // APY e.g., 18.5 for 18.5%
  minimumPayment: number;
}

interface StrategyResult {
  monthsToFreedom: number;
  totalInterestPaid: number;
  trajectory: number[];
}

export async function calculateDebtPayoff(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { debts, extraPayment } = req.body as { debts: Debt[], extraPayment: number };

    if (!debts || debts.length === 0) {
      return res.status(400).json({ error: "No debts provided." });
    }

    // A helper function to run the amortization loop based on a specific sorting strategy
    const runStrategy = (sortFn: (a: Debt, b: Debt) => number): StrategyResult => {
      // Deep copy to avoid mutating the original array between strategy runs
      let currentDebts = debts.map(d => ({ ...d }));
      let totalInterestPaid = 0;
      let monthsPassed = 0;
      const trajectory = [];
      
      let totalBalance = currentDebts.reduce((sum, d) => sum + d.balance, 0);
      trajectory.push(totalBalance);

      // Hard stop at 600 months (50 years) to prevent infinite loops if min payments don't cover interest
      while (totalBalance > 0 && monthsPassed < 600) {
        monthsPassed++;
        
        // Apply monthly interest to all debts first
        for (let d of currentDebts) {
          if (d.balance > 0) {
            const monthlyInterest = d.balance * (d.interestRate / 100 / 12);
            d.balance += monthlyInterest;
            totalInterestPaid += monthlyInterest;
          }
        }

        // Sort active debts based on the strategy
        currentDebts = currentDebts.filter(d => d.balance > 0).sort(sortFn);
        
        // 1. Pay each debt's own minimum payment first so no debt misses it
        for (let d of currentDebts) {
          const pay = Math.min(d.minimumPayment, d.balance);
          d.balance -= pay;
        }

        // 2. Cascade only the extra payment down the sorted list
        let extra = extraPayment;
        for (let d of currentDebts) {
          if (extra <= 0) break;

          const pay = Math.min(d.balance, extra);
          d.balance -= pay; // Apply extra cash to this debt
          extra -= pay;
        }

        totalBalance = currentDebts.reduce((sum, d) => sum + d.balance, 0);
        trajectory.push(parseFloat(totalBalance.toFixed(2)));
      }

      return {
        monthsToFreedom: monthsPassed,
        totalInterestPaid: parseFloat(totalInterestPaid.toFixed(2)),
        trajectory
      };
    };

    // Snowball Strategy: Lowest Balance First (Psychological wins)
    const snowball = runStrategy((a, b) => a.balance - b.balance);
    
    // Avalanche Strategy: Highest Interest First (Mathematically optimal)
    const avalanche = runStrategy((a, b) => b.interestRate - a.interestRate);

    res.json({
      success: true,
      data: {
        snowball,
        avalanche
      }
    });

  } catch (error: any) {
    logger.error("DEBT_CALCULATION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to calculate debt amortization schedules" });
  }
}
