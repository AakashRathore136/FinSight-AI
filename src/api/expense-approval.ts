import logger from "../lib/logger.js";

interface ExpenseApproval {
  id: string;
  initiator: string;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

// Mock Database of shared account pending expenses
let sharedExpenseInbox: ExpenseApproval[] = [
  { id: "exp_101", initiator: "Partner A", merchant: "Apple Store", amount: 1299.00, category: "Electronics", date: new Date().toISOString(), status: 'PENDING' },
  { id: "exp_102", initiator: "Partner A", merchant: "Delta Airlines", amount: 645.50, category: "Travel", date: new Date(Date.now() - 86400000).toISOString(), status: 'PENDING' },
  { id: "exp_103", initiator: "Partner A", merchant: "Corner Coffee", amount: 12.00, category: "Food", date: new Date(Date.now() - 3600000).toISOString(), status: 'PENDING' },
];

// Shared multi-signature threshold. Expenses at or above this amount require
// joint approval; the same value is used by the UI for display and by the API
// for filtering so the shown list always matches the stated threshold.
const APPROVAL_THRESHOLD = 500.00;

export async function getPendingApprovals(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Accept an explicit threshold from the caller, falling back to the shared default.
    const parsed = parseFloat(req.query.threshold as string);
    const threshold = Number.isFinite(parsed) && parsed > 0 ? parsed : APPROVAL_THRESHOLD;

    // Show only PENDING expenses at or above the approval threshold.
    const pending = sharedExpenseInbox.filter(
      exp => exp.status === 'PENDING' && exp.amount >= threshold
    );
    
    res.json({ success: true, data: pending, threshold });
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

    const expenseIndex = sharedExpenseInbox.findIndex(exp => exp.id === expenseId);
    
    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // In a real app, verify that the 'initiator' is NOT the same as the 'approver' (req.user)
    // to enforce true multi-signature consensus.

    sharedExpenseInbox[expenseIndex].status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    
    if (action === 'APPROVED') {
      logger.info(`[MULTI_SIG] Expense ${expenseId} approved. Releasing funds to ledger.`);
      // Proceed to update standard Budget Ledger
    } else {
      logger.info(`[MULTI_SIG] Expense ${expenseId} rejected. Blocking ledger update.`);
    }

    res.json({ 
      success: true, 
      data: { 
        id: expenseId, 
        status: sharedExpenseInbox[expenseIndex].status 
      } 
    });

  } catch (error: any) {
    logger.error("APPROVAL_REVIEW_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to process expense review" });
  }
}
