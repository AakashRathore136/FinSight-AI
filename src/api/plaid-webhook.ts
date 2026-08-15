import logger from "../lib/logger.js";
import crypto from "crypto";

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

// Persisted Plaid item_id -> owning FinSight userId mapping. In production this
// would live in Firestore; here it resolves which user a webhook belongs to so
// reconciled transactions are never attributed to a constant fake user.
const itemToUser: Record<string, string> = {
  "item_demo": "usr_123",
};

// Verify Plaid's webhook signature (Plaid-Webhook-Verification-Code). The header
// is an HMAC-SHA256 of the raw request body keyed by the client secret, base64
// encoded. We reject unauthenticated calls with 401.
function verifyPlaidSignature(rawBody: string, headerValue: string | undefined): boolean {
  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured: an untrusted endpoint must not be allowed to mutate
    // the ledger, so reject the request.
    return false;
  }
  if (!headerValue) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(expected);
  const b = Buffer.from(headerValue);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
    // 1. Verify the Plaid webhook signature before processing anything.
    const signatureHeader =
      req.headers["plaid-webhook-verification-code"] ||
      req.headers["Plaid-Webhook-Verification-Code"];
    const rawBody = typeof req.rawBody === "string"
      ? req.rawBody
      : JSON.stringify(req.body);
    if (!verifyPlaidSignature(rawBody, signatureHeader)) {
      logger.warn(`[PLAID_WEBHOOK] Rejected unauthenticated webhook (missing/invalid signature).`);
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // 2. Resolve the owning FinSight user from the Plaid item_id. Never trust a
    //    constant userId — unknown items are rejected to prevent cross-account
    //    ledger corruption.
    const { webhook_type, webhook_code, item_id, new_transactions } = req.body;

    const ownerUserId = itemToUser[item_id];
    if (!ownerUserId) {
      logger.warn(`[PLAID_WEBHOOK] Rejected webhook for unknown item_id ${item_id}.`);
      return res.status(401).json({ error: "Unknown Plaid item" });
    }

    if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'DEFAULT_UPDATE') {
      return res.status(200).send("Webhook ignored");
    }

    logger.info(`[PLAID_WEBHOOK] Received transactions update for item ${item_id} (user ${ownerUserId}). Running deduplication worker.`);

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

      // 2. Fallback: Fuzzy Matching (Amount matches exactly, date within 3 days, partial string match)
      if (!matchedPending) {
        matchedPending = transactionsDb.find(t => 
          t.status === 'PENDING' && 
          t.amount === postedTx.amount &&
          Math.abs(new Date(t.date).getTime() - new Date(postedTx.date).getTime()) <= 3 * 24 * 60 * 60 * 1000
        );
        if (matchedPending) confidenceScore = 0.85; // Fuzzy match confidence
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
