import logger from "../lib/logger.js";

interface CashFlowProjection {
  date: string;
  projectedBalance: number;
  expectedExpenses: { name: string; amount: number }[];
  isOverdraftRisk: boolean;
}

export async function predictOverdraftRisk(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // This would normally fetch actual bank balances and historical transaction data
    // to feed into a time-series model (e.g., Prophet) to predict the next 7 days.
    const currentBalance = 450.25;

    // Simulating model prediction delay
    await new Promise(resolve => setTimeout(resolve, 600));

    const today = new Date();
    const projections: CashFlowProjection[] = [];
    let runningBalance = currentBalance;
    let overdraftDetected = false;
    let overdraftDate: string | null = null;

    // Mocking a 7-day projection where a large bill drops the balance below zero
    for (let i = 1; i <= 7; i++) {
      const projectionDate = new Date(today);
      projectionDate.setDate(today.getDate() + i);
      const dateStr = projectionDate.toISOString().split('T')[0];

      const expectedExpenses = [];
      let dailySpend = 0;

      // Add a small daily average spend
      dailySpend += 35; 
      
      // Introduce a major recurring bill on day 4 that causes the overdraft
      if (i === 4) {
        expectedExpenses.push({ name: "Auto Insurance Premium", amount: 285.00 });
        dailySpend += 285.00;
      }
      
      // Introduce rent/mortgage on day 6
      if (i === 6) {
        expectedExpenses.push({ name: "Property Management / Rent", amount: 1550.00 });
        dailySpend += 1550.00;
      }

      runningBalance -= dailySpend;

      // Add income on day 7 to recover
      if (i === 7) {
        runningBalance += 3200.00; // Paycheck
      }

      const isRisk = runningBalance < 0;
      
      if (isRisk && !overdraftDetected) {
        overdraftDetected = true;
        overdraftDate = dateStr;
        // In a real system, we would trigger an SNS/Twilio webhook here to send an SMS/Push Notification
        logger.warn(`[OVERDRAFT_PREDICTION_ALERT] User ${user.uid} projected to overdraft on ${dateStr}`);
      }

      projections.push({
        date: dateStr,
        projectedBalance: parseFloat(runningBalance.toFixed(2)),
        expectedExpenses,
        isOverdraftRisk: isRisk
      });
    }

    res.json({
      success: true,
      data: {
        currentBalance,
        overdraftRiskDetected: overdraftDetected,
        firstOverdraftDate: overdraftDate,
        projections
      }
    });

  } catch (error: any) {
    logger.error("OVERDRAFT_PREDICTION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to generate overdraft predictions" });
  }
}
