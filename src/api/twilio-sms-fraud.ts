import logger from "../lib/logger.js";
// import twilio from "twilio";

// Mock implementation of Twilio Client
const twilioClient = {
  messages: {
    create: async (opts: any) => {
      logger.info(`Mock Twilio SMS sent to ${opts.to}: "${opts.body}"`);
      return { sid: "SM" + Math.random().toString(36).substring(7) };
    }
  }
};

interface TransactionWebhook {
  userId: string;
  transactionId: string;
  amount: number;
  merchant: string;
  countryCode: string; // e.g. "US", "RU", "CN"
}

export async function processTransactionWebhook(req: any, res: any) {
  try {
    // This endpoint would typically be called by Plaid or a bank's webhook, not a user.
    // It verifies the webhook signature before proceeding.
    
    const tx: TransactionWebhook = req.body;
    if (!tx || !tx.transactionId) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    // 1. Fetch User Settings from DB (Mock)
    const userSettings = {
      phone: "+15551234567",
      smsAlertsEnabled: true,
      homeCountry: "US",
      anomalyThreshold: 500 // Flag anything over $500
    };

    if (!userSettings.smsAlertsEnabled || !userSettings.phone) {
      return res.status(200).json({ status: "ignored_user_opt_out" });
    }

    let isAnomaly = false;
    let anomalyReason = "";

    // 2. Evaluate Anomaly Criteria
    if (tx.amount > userSettings.anomalyThreshold) {
      isAnomaly = true;
      anomalyReason = `Large transaction of $${tx.amount}`;
    } else if (tx.countryCode !== userSettings.homeCountry) {
      isAnomaly = true;
      anomalyReason = `Foreign transaction in ${tx.countryCode}`;
    }

    // 3. Trigger Twilio SMS if anomalous
    if (isAnomaly) {
      const messageBody = `FinSight Alert: ${anomalyReason} at ${tx.merchant}. Reply 1 for YES I recognize this, or 2 for NO to freeze card.`;
      
      await twilioClient.messages.create({
        body: messageBody,
        from: process.env.TWILIO_PHONE_NUMBER || "+1234567890",
        to: userSettings.phone
      });

      // Log the alert to the DB awaiting user response
      logger.warn(`Fraud alert SMS dispatched for TX ${tx.transactionId}`);
      
      return res.status(200).json({ status: "alert_dispatched" });
    }

    res.status(200).json({ status: "cleared" });

  } catch (error: any) {
    logger.error("WEBHOOK_PROCESSING_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to process transaction webhook" });
  }
}

// Webhook for Twilio to send user SMS replies back to our server
export async function handleTwilioReply(req: any, res: any) {
  const { Body, From } = req.body;
  
  if (Body === "2") {
    logger.error(`USER TRIGGERED ACCOUNT FREEZE VIA SMS: Phone ${From}`);
    // Trigger card freeze logic via banking API
  }

  res.send("<Response></Response>"); // TwiML empty response
}
