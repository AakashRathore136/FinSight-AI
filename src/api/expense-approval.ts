import logger from "../lib/logger.js";

interface ExpenseApproval {
  id: string;
  initiator: string;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approver?: string;
}

// Per-account pending-expense inboxes. Earlier this was a single module-level
// array shared across every user, which broke multi-tenant isolation. Each
// account now owns its own queue, keyed by the authenticated user's uid.
const expenseInboxes = new Map<string, ExpenseApproval[]>();

// Seed each account with an isolated copy of the demo expenses on first access
// so no account can see or act on another account's pending approvals.
const SEED_EXPENSES: ExpenseApproval[] = [
  { id: "exp_101", initiator: "Partner A", merchant: "Apple Store", amount: 1299.00, category: "Electronics", date: new Date().toISOString(), status: 'PENDING' },
  { id: "exp_102", initiator: "Partner A", merchant: "Delta Airlines", amount: 645.50, category: "Travel", date: new Date(Date.now() - 86400000).toISOString(), status: 'PENDING' },
];

function getUserInbox(uid: string): ExpenseApproval[] {
  let inbox = expenseInboxes.get(uid);
  if (!inbox) {
    inbox = SEED_EXPENSES.map(exp => ({ ...exp }));
    expenseInboxes.set(uid, inbox);
  }
  return inbox;
}

export async function getPendingApprovals(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Only show this account's own PENDING expenses.
    const pending = getUserInbox(user.uid).filter(exp => exp.status === 'PENDING');
    
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

    const inbox = getUserInbox(user.uid);
    const expenseIndex = inbox.findIndex(exp => exp.id === expenseId);
    
    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Enforce true multi-signature consensus: the approver must be a DIFFERENT
    // user than the initiator. Match on uid, falling back to email when the uid
    // is not recorded on the expense.
    const initiator = inbox[expenseIndex].initiator;
    const isSelf =
      initiator === user.uid ||
      (user.email && initiator === user.email);
    if (isSelf) {
      logger.warn(`[MULTI_SIG] User ${user.uid} attempted to self-approve expense ${expenseId}.`);
      return res.status(403).json({ error: "You cannot approve your own expense (multi-signature required)." });
    }

    inbox[expenseIndex].status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    inbox[expenseIndex].approver = user.uid;
    
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
        status: inbox[expenseIndex].status,
        approver: inbox[expenseIndex].approver,
      } 
    });

  } catch (error: any) {
    logger.error("APPROVAL_REVIEW_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to process expense review" });
  }
}
