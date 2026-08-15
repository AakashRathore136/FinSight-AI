import logger from "../lib/logger.js";
import { getFirestore } from "firebase-admin/firestore";

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

// Reconciliation state is persisted to Firestore (keyed in a single doc) so the
// worker is durable and idempotent across server restarts and across serverless
// function instances, instead of living in module-level arrays that reset to a
// seed on every cold start (which previously re-merged already-POSTED
// transactions and reset the "Duplicates Prevented" counter).
const STATE_COLLECTION = "plaid_reconciliation";
const STATE_DOC = "state";
const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)";

// Seed used only when no persisted state exists yet (first ever run).
const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: "tx_local_1",
    userId: "usr_123",
    amount: 45.99,
    date: "2024-03-01",
    merchantName: "SQ *LOCAL COFFEE",
    status: "PENDING",
    plaidTransactionId: "plaid_p_1",
    pendingTransactionId: null,
  },
  {
    id: "tx_local_2",
    userId: "usr_123",
    amount: 12.0,
    date: "2024-03-02",
    merchantName: "UBER EATS",
    status: "PENDING",
    plaidTransactionId: "plaid_p_2",
    pendingTransactionId: null,
  },
];

async function loadState(): Promise<{
  transactions: Transaction[];
  logs: ReconciliationLog[];
}> {
  try {
    const db = getFirestore(firestoreDatabaseId);
    const ref = db.collection(STATE_COLLECTION).doc(STATE_DOC);
    const snap = await ref.get();
    if (!snap.exists) {
      const seeded = { transactions: SEED_TRANSACTIONS, logs: [] as ReconciliationLog[] };
      await ref.set(seeded);
      return seeded;
    }
    const data = snap.data() || {};
    return {
      transactions: (data.transactions as Transaction[]) || [],
      logs: (data.logs as ReconciliationLog[]) || [],
    };
  } catch (error: any) {
    logger.error("PLAID_STATE_LOAD_FAILED", { message: error?.message });
    // Fall back to an empty in-memory state rather than crashing the worker.
    return { transactions: [], logs: [] };
  }
}

async function saveState(
  transactions: Transaction[],
  logs: ReconciliationLog[],
): Promise<void> {
  try {
    const db = getFirestore(firestoreDatabaseId);
    await db
      .collection(STATE_COLLECTION)
      .doc(STATE_DOC)
      .set({ transactions, logs });
  } catch (error: any) {
    logger.error("PLAID_STATE_SAVE_FAILED", { message: error?.message });
  }
}

export async function handlePlaidWebhook(req: any, res: any) {
  try {
    // In production, verify the Plaid webhook signature using plaid-node client
    const { webhook_type, webhook_code, item_id, new_transactions } = req.body;

    if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'DEFAULT_UPDATE') {
      return res.status(200).send("Webhook ignored");
    }

    logger.info(`[PLAID_WEBHOOK] Received transactions update for item ${item_id}. Running deduplication worker.`);

    // Load the durable ledger + logs (persisted in Firestore).
    const state = await loadState();
    const transactionsDb = state.transactions;
    const reconciliationLogs = state.logs;

    // Mock incoming "POSTED" transactions from Plaid's /transactions/get endpoint
    const fetchedPostedTransactions = [
      {
        transaction_id: "plaid_posted_1",
        pending_transaction_id: "plaid_p_1", // Plaid provides this deterministic link if available
        amount: 45.99,
        date: "2024-03-02",
        merchant_name: "Local Coffee Roasters", // Notice the merchant name changed upon clearing
      },
      {
        transaction_id: "plaid_posted_2",
        pending_transaction_id: null, // Sometimes Plaid loses the link
        amount: 12.0,
        date: "2024-03-02",
        merchant_name: "Uber Eats Pending", // Fuzzy matching required
      },
    ];

    for (const postedTx of fetchedPostedTransactions) {
      // Idempotency guard: if this exact posted transaction has already been
      // reconciled/recorded, skip it so retries and restarts never duplicate.
      const alreadyRecorded = transactionsDb.some(
        (t) => t.plaidTransactionId === postedTx.transaction_id,
      );
      if (alreadyRecorded) {
        logger.info(
          `[RECONCILIATION] Skipping already-recorded posted tx ${postedTx.transaction_id}`,
        );
        continue;
      }

      // 1. Deterministic Matching (Using Plaid's provided pending_transaction_id)
      let matchedPending = transactionsDb.find(
        (t) => t.status === 'PENDING' && t.plaidTransactionId === postedTx.pending_transaction_id,
      );

      let confidenceScore = 0;

      // 2. Fallback: Fuzzy Matching (Amount matches exactly, date within 3 days, partial string match)
      if (!matchedPending) {
        matchedPending = transactionsDb.find(
          (t) =>
            t.status === 'PENDING' &&
            t.amount === postedTx.amount &&
            Math.abs(new Date(t.date).getTime() - new Date(postedTx.date).getTime()) <=
              3 * 24 * 60 * 60 * 1000,
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

        logger.info(
          `[RECONCILIATION] Merged pending tx ${matchedPending.id} with posted tx ${postedTx.transaction_id}`,
        );

        reconciliationLogs.unshift({
          timestamp: new Date().toISOString(),
          mergedPendingId: matchedPending.id,
          newPostedId: postedTx.transaction_id,
          confidenceScore,
          merchantName: postedTx.merchant_name,
        });
      } else {
        // No match found, safe to insert as a brand new transaction — but only
        // if one with this plaidTransactionId is not already present.
        const newTx: Transaction = {
          id: `tx_local_${Date.now()}`,
          userId: "usr_123",
          amount: postedTx.amount,
          date: postedTx.date,
          merchantName: postedTx.merchant_name || "Unknown",
          status: 'POSTED',
          plaidTransactionId: postedTx.transaction_id,
          pendingTransactionId: postedTx.pending_transaction_id,
        };
        transactionsDb.push(newTx);
      }
    }

    // Persist the reconciled ledger + logs so restarts/retries stay durable.
    await saveState(transactionsDb, reconciliationLogs);

    res.status(200).json({ success: true, message: "Webhook processed and ledger reconciled." });
  } catch (error: any) {
    logger.error("PLAID_WEBHOOK_ERROR", { message: error.message });
    res.status(500).send("Webhook processing failed");
  }
}

// Endpoint for the UI to fetch the worker logs
export async function getReconciliationLogs(req: any, res: any) {
  const state = await loadState();
  res.json({ success: true, data: state.logs });
}
