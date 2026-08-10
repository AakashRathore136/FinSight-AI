import logger from "../lib/logger.js";

// Mock interfaces representing DB models
interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
}

interface ReallocationSuggestion {
  fromCategory: string;
  toCategory: string;
  amount: number;
  reason: string;
}

export async function getBudgetReallocationSuggestions(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // In a production environment, we would fetch the user's budget from the DB
    const mockBudgets: BudgetCategory[] = [
      { id: "1", name: "Groceries", allocated: 400, spent: 485 }, // Overspent by 85
      { id: "2", name: "Dining Out", allocated: 200, spent: 230 }, // Overspent by 30
      { id: "3", name: "Entertainment", allocated: 150, spent: 50 }, // Underspent by 100
      { id: "4", name: "Transportation", allocated: 100, spent: 40 }, // Underspent by 60
    ];

    const overspent: BudgetCategory[] = [];
    const underspent: BudgetCategory[] = [];

    mockBudgets.forEach(b => {
      if (b.spent > b.allocated) overspent.push({ ...b });
      else if (b.spent < b.allocated) underspent.push({ ...b });
    });

    const suggestions: ReallocationSuggestion[] = [];

    // Simple Greedy Algorithm to match overspent with underspent
    // Sort underspent by largest surplus first
    underspent.sort((a, b) => (b.allocated - b.spent) - (a.allocated - a.spent));

    for (const deficitCategory of overspent) {
      let deficit = deficitCategory.spent - deficitCategory.allocated;

      for (const surplusCategory of underspent) {
        if (deficit <= 0) break;
        
        const surplus = surplusCategory.allocated - surplusCategory.spent;
        if (surplus <= 0) continue;

        const amountToMove = Math.min(deficit, surplus);
        
        suggestions.push({
          fromCategory: surplusCategory.name,
          toCategory: deficitCategory.name,
          amount: amountToMove,
          reason: `Cover $${amountToMove} deficit in ${deficitCategory.name} using surplus from ${surplusCategory.name}.`
        });

        // Adjust temporary states
        deficit -= amountToMove;
        surplusCategory.spent += amountToMove; // logically reducing surplus
      }
    }

    res.json({
      success: true,
      data: suggestions,
      message: suggestions.length > 0 ? "Found reallocation opportunities" : "Budget is healthy"
    });

  } catch (error: any) {
    logger.error("BUDGET_REALLOC_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to calculate budget reallocations" });
  }
}

export async function applyBudgetReallocation(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // The frontend sends the approved suggestions
    const { approvedSuggestions } = req.body;

    // In a real app:
    // 1. Start DB Transaction
    // 2. Adjust allocated amounts in the Budget tables
    // 3. Insert audit records into 'budget_adjustments_log'
    // 4. Commit Transaction

    logger.info(`Applied ${approvedSuggestions.length} budget reallocations for user ${user.uid}`);

    res.json({
      success: true,
      message: "Budget successfully adjusted and logged."
    });
  } catch (error: any) {
    logger.error("APPLY_REALLOC_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to apply budget adjustments" });
  }
}
