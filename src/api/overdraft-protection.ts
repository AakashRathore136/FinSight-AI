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

    // Seed from the authenticated user's real current balance when provided;
    // otherwise fall back to a demo constant for manual testing only.
    const currentBalance = typeof req.body?.currentBalance === 'number' ? req.body.currentBalance : 450.25;

    // Use the user's real scheduled/pending transactions when supplied;
    // otherwise fall back to a demo fixture. Each entry is applied on its `day`
    // offset (1-7) and flagged as `income` when it credits the balance.
    const scheduled: { day: number; name: string; amount: number; income: boolean }[] =
      Array.isArray(req.body?.transactions) ? req.body.transactions : [
        { day: 4, name: "Auto Insurance Premium", amount: 285.00, income: false },
        { day: 6, name: "Property Management / Rent", amount: 1550.00, income: false },
        { day: 7, name: "Paycheck", amount: 3200.00, income: true },
      ];

    // Simulating model prediction delay
    await new Promise(resolve => setTimeout(resolve, 600));

    const today = new Date();
    const projections: CashFlowProjection[] = [];
    let runningBalance = currentBalance;
    let overdraftDetected = false;
    let overdraftDate: string | null = null;

    // 7-day projection driven by the user's actual expected expenses/income
    for (let i = 1; i <= 7; i++) {
      const projectionDate = new Date(today);
      projectionDate.setDate(today.getDate() + i);
      const dateStr = projectionDate.toISOString().split('T')[0];

      const expectedExpenses = [];
      let dailySpend = 0;

      // Add a small daily average spend
      dailySpend += 35;

      for (const t of scheduled) {
        if (t.day !== i) continue;
        const amt = Number(t.amount) || 0;
        if (t.income) {
          runningBalance += amt;
        } else {
          expectedExpenses.push({ name: t.name, amount: amt });
          dailySpend += amt;
        }
      }

      runningBalance -= dailySpend;

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
