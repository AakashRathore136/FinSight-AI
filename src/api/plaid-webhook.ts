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
  needsManualReview?: boolean;
}

// Normalize a merchant name for fuzzy comparison: lowercase, strip punctuation
// and whitespace so "SQ *LOCAL COFFEE" ~ "Local Coffee Roasters".
function normalizeMerchant(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Similarity in [0, 1] based on substring containment / shared tokens.
function merchantSimilarity(a: string, b: string): number {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const tokensA = new Set(na.match(/.{4,}/g) || []);
  const tokensB = new Set(nb.match(/.{4,}/g) || []);
  let overlap = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) overlap++; });
  const total = tokensA.size + tokensB.size;
  return total === 0 ? 0 : (2 * overlap) / total;
}

// Mock Database of active transactions
let transactionsDb: Transaction[] = [
  // A pending transaction that hasn't cleared yet
  { id: "tx_local_1", userId: "usr_123", amount: 45.99, date: "2024-03-01", merchantName: "SQ *LOCAL COFFEE", status: "PENDING", plaidTransactionId: "plaid_p_1", pendingTransactionId: null },
  { id: "tx_local_2", userId: "usr_123", amount: 12.00, date: "2024-03-02", merchantName: "UBER EATS", status: "PENDING", plaidTransactionId: "plaid_p_2", pendingTransactionId: null },
];

let reconciliationLogs: ReconciliationLog[] = [];

export async function handlePlaidWebhook(req: any, res: any) {
  try {
    // In production, verify the Plaid webhook signature using plaid-node client
    const { webhook_type, webhook_code, item_id, new_transactions } = req.body;

    if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'DEFAULT_UPDATE') {
      return res.status(200).send("Webhook ignored");
    }

    logger.info(`[PLAID_WEBHOOK] Received transactions update for item ${item_id}. Running deduplication worker.`);

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
      
      // 1. Deterministic Matching (Using Plaid's provided pending_transaction_id)
      let matchedPending = transactionsDb.find(
        t => t.status === 'PENDING' && t.plaidTransactionId === postedTx.pending_transaction_id
      );

      let confidenceScore = 0;

      // 2. Fallback: Fuzzy Matching (Amount matches exactly, date within 3 days).
      // Collect ALL candidates so we can disambiguate instead of silently
      // picking the first one (which could merge into the WRONG pending tx).
      if (!matchedPending) {
        const candidates = transactionsDb.filter(t =>
          t.status === 'PENDING' &&
          t.amount === postedTx.amount &&
          Math.abs(new Date(t.date).getTime() - new Date(postedTx.date).getTime()) <= 3 * 24 * 60 * 60 * 1000
        );

        // Disambiguate using normalized merchant-name similarity.
        const similar = candidates.filter(t =>
          merchantSimilarity(t.merchantName, postedTx.merchant_name) >= 0.6
        );

        if (similar.length === 1) {
          matchedPending = similar[0];
          confidenceScore = 0.85; // Fuzzy match confidence
        } else {
          // Ambiguous: zero or multiple equally-good candidates. Flag for
          // manual review rather than merging the first hit (which would
          // double- or mis-reconcile the ledger).
          reconciliationLogs.unshift({
            timestamp: new Date().toISOString(),
            mergedPendingId: "",
            newPostedId: postedTx.transaction_id,
            confidenceScore: 0,
            merchantName: postedTx.merchant_name,
            needsManualReview: true,
          });
          continue;
        }
      } else {
        confidenceScore = 1.0; // Deterministic match confidence
      }

      if (matchedPending) {
        // RECONCILIATION: Update the existing row instead of inserting a duplicate
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
        // No match found, safe to insert as a brand new transaction
        const newTx: Transaction = {
          id: `tx_local_${Date.now()}`,
          userId: "usr_123",
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
