import logger from "../lib/logger.js";

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  date: string;
  merchantName: string;
  status: 'PENDING' | 'POSTED';
  plaidTransactionId: string | null;
  pendingTransactionId: string | null;
}

interface ReconciliationLog {
  timestamp: string;
  mergedPendingId: string;
  newPostedId: string;
  confidenceScore: number;
  merchantName: string;
}

// Mock Database of active transactions
let transactionsDb: Transaction[] = [
  // A pending transaction that hasn't cleared yet
  { id: "tx_local_1", userId: "usr_123", amount: 45.99, date: "2024-03-01", merchantName: "SQ *LOCAL COFFEE", status: "PENDING", plaidTransactionId: "plaid_p_1", pendingTransactionId: null },
  { id: "tx_local_2", userId: "usr_123", amount: 12.00, date: "2024-03-02", merchantName: "UBER EATS", status: "PENDING", plaidTransactionId: "plaid_p_2", pendingTransactionId: null },
];

let reconciliationLogs: ReconciliationLog[] = [];

// Stored Plaid item_id -> user mapping. In production this would be loaded from
// the persisted Plaid link/access-token store created when the user connects
// their bank, never derived or guessed from the webhook payload.
const itemUserMap = new Map<string, string>();

function resolveUserIdFromItemId(itemId: string | undefined): string | undefined {
  if (!itemId) return undefined;
  return itemUserMap.get(itemId);
}

export async function handlePlaidWebhook(req: any, res: any) {
  try {
    // In production, verify the Plaid webhook signature using plaid-node client
    const { webhook_type, webhook_code, item_id, new_transactions } = req.body;

    if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'DEFAULT_UPDATE') {
      return res.status(200).send("Webhook ignored");
    }

    logger.info(`[PLAID_WEBHOOK] Received transactions update for item ${item_id}. Running deduplication worker.`);

    // Owner must come from the stored item_id -> user mapping, never hardcoded.
    const ownerUserId = resolveUserIdFromItemId(item_id);

    // Mock incoming "POSTED" transactions from Plaid's /transactions/get endpoint
    const fetchedPostedTransactions = [
      { 
        transaction_id: "plaid_posted_1", 
        pending_transaction_id: "plaid_p_1", // Plaid provides this deterministic link if available
        amount: 45.99, 
        date: "2024-03-02", 
        merchant_name: "Local Coffee Roasters" // Notice the merchant name changed upon clearing
      },
      { 
        transaction_id: "plaid_posted_2", 
        pending_transaction_id: null, // Sometimes Plaid loses the link
        amount: 12.00, 
        date: "2024-03-02", 
        merchant_name: "Uber Eats Pending" // Fuzzy matching required
      }
    ];

    for (const postedTx of fetchedPostedTransactions) {
      // Idempotency guard: if this posted transaction was already reconciled
      // (webhook retries are common) skip it instead of inserting a duplicate.
      const alreadyReconciled = transactionsDb.find(
        t => t.plaidTransactionId === postedTx.transaction_id
      );
      if (alreadyReconciled) {
        logger.info(`[RECONCILIATION] Skipping already-reconciled posted tx ${postedTx.transaction_id}`);
        continue;
      }

      // 1. Deterministic Matching (Using Plaid's provided pending_transaction_id)
      let matchedPending = transactionsDb.find(
        t => t.status === 'PENDING' &&
          t.plaidTransactionId === postedTx.pending_transaction_id &&
          (ownerUserId ? t.userId === ownerUserId : true)
      );

      let confidenceScore = 0;

      // 2. Fallback: Fuzzy Matching — scoped by user, amount, 3-day window, AND a
      //    merchant signal. Multiple candidates are unsafe, so we bail rather than
      //    merge into the wrong pending row.
      if (!matchedPending) {
        const candidates = transactionsDb.filter(t =>
          t.status === 'PENDING' &&
          t.amount === postedTx.amount &&
          Math.abs(new Date(t.date).getTime() - new Date(postedTx.date).getTime()) <= 3 * 24 * 60 * 60 * 1000 &&
          (ownerUserId ? t.userId === ownerUserId : true) &&
          !!(t.merchantName && postedTx.merchant_name) &&
          (
            t.merchantName.toLowerCase().includes(postedTx.merchant_name.toLowerCase()) ||
            postedTx.merchant_name.toLowerCase().includes(t.merchantName.toLowerCase())
          )
        );
        if (candidates.length === 1) {
          matchedPending = candidates[0];
          confidenceScore = 0.85; // Fuzzy match confidence
        } else if (candidates.length > 1) {
          logger.warn(`[RECONCILIATION] ${candidates.length} fuzzy candidates for posted tx ${postedTx.transaction_id}; skipping unsafe merge`);
        }
      } else {
        confidenceScore = 1.0; // Deterministic match confidence
      }

      if (matchedPending) {
        // RECONCILIATION: Update the existing row instead of inserting a duplicate.
        // Keep the original pending link stable for idempotent re-processing.
        matchedPending.status = 'POSTED';
        matchedPending.plaidTransactionId = postedTx.transaction_id;
        matchedPending.merchantName = postedTx.merchant_name; // Use the cleaner settled name
        matchedPending.date = postedTx.date;
        matchedPending.pendingTransactionId = postedTx.pending_transaction_id;

        logger.info(`[RECONCILIATION] Merged pending tx ${matchedPending.id} with posted tx ${postedTx.transaction_id}`);
        
        reconciliationLogs.unshift({
          timestamp: new Date().toISOString(),
          mergedPendingId: matchedPending.id,
          newPostedId: postedTx.transaction_id,
          confidenceScore,
          merchantName: postedTx.merchant_name
        });

      } else {
        // No match found. Only insert as a brand new transaction when we can
        // attribute it to the correct owner derived from the item_id mapping.
        if (!ownerUserId) {
          logger.warn(`[PLAID_WEBHOOK] Cannot attribute posted tx ${postedTx.transaction_id}: no user mapping for item ${item_id}`);
          continue;
        }
        const newTx: Transaction = {
          id: `tx_local_${Date.now()}`,
          userId: ownerUserId,
          amount: postedTx.amount,
          date: postedTx.date,
          merchantName: postedTx.merchant_name || "Unknown",
          status: 'POSTED',
          plaidTransactionId: postedTx.transaction_id,
          pendingTransactionId: postedTx.pending_transaction_id
        };
        transactionsDb.push(newTx);
      }
    }

    res.status(200).json({ success: true, message: "Webhook processed and ledger reconciled." });

  } catch (error: any) {
    logger.error("PLAID_WEBHOOK_ERROR", { message: error.message });
    res.status(500).send("Webhook processing failed");
  }
}

// Endpoint for the UI to fetch the worker logs
export async function getReconciliationLogs(req: any, res: any) {
  res.json({ success: true, data: reconciliationLogs });
}
