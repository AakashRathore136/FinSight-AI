import logger from "../lib/logger.js";

interface ExpenseApproval {
  id: string;
  initiator: string;
  initiatorUid: string;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  householdId: string;
}

// Per-household inbox. Previously this was a single global array shared by
// every request, leaking one household's pending expenses to all users and
// allowing ID collisions across accounts. Now expenses are scoped by the
// owning household/account id derived from the authenticated user.
const sharedExpenseInbox: Record<string, ExpenseApproval[]> = {
  "household_demo": [
    { id: "exp_101", initiator: "Partner A", initiatorUid: "usr_partner_a", merchant: "Apple Store", amount: 1299.00, category: "Electronics", date: new Date().toISOString(), status: 'PENDING', householdId: "household_demo" },
    { id: "exp_102", initiator: "Partner A", initiatorUid: "usr_partner_a", merchant: "Delta Airlines", amount: 645.50, category: "Travel", date: new Date(Date.now() - 86400000).toISOString(), status: 'PENDING', householdId: "household_demo" },
  ],
};

function getHouseholdId(req: any): string {
  // A real deployment resolves the user's household/account id; fall back to
  // the user's own uid when no explicit household membership is present.
  return req.user?.householdId || req.user?.uid || "";
}

export async function getPendingApprovals(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const householdId = getHouseholdId(req);
    const inbox = sharedExpenseInbox[householdId] || [];

    // Filter to only show this household's PENDING expenses.
    const pending = inbox.filter(exp => exp.status === 'PENDING');
    
    res.json({ success: true, data: pending });
  } catch (error: any) {
    logger.error("APPROVAL_FETCH_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
}

export async function reviewExpenseApproval(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { expenseId, action } = req.body;
    
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const householdId = getHouseholdId(req);
    const inbox = sharedExpenseInbox[householdId] || [];
    const expenseIndex = inbox.findIndex(exp => exp.id === expenseId);
    
    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const expense = inbox[expenseIndex];

    // Enforce true multi-signature: the approver must NOT be the initiator.
    if (expense.initiatorUid && expense.initiatorUid === user.uid) {
      return res.status(409).json({
        error: "Self-approval denied: the initiator cannot approve their own expense.",
      });
    }

    expense.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    
    if (action === 'APPROVED') {
      logger.info(`[MULTI_SIG] Expense ${expenseId} approved by ${user.uid}. Releasing funds to ledger.`);
      // Proceed to update standard Budget Ledger
    } else {
      logger.info(`[MULTI_SIG] Expense ${expenseId} rejected by ${user.uid}. Blocking ledger update.`);
    }

    res.json({ 
      success: true, 
      data: { 
        id: expenseId, 
        status: expense.status 
      } 
    });

  } catch (error: any) {
    logger.error("APPROVAL_REVIEW_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to process expense review" });
  }
}
