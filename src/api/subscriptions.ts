import logger from "../lib/logger.js";

interface ProviderData {
  name: string;
  regex: RegExp;
  cancelUrl?: string;
  supportEmail?: string;
}

// A mapped database of common subscription providers and their cancellation routes
const PROVIDERS_DB: ProviderData[] = [
  {
    name: "Netflix",
    regex: /netflix/i,
    cancelUrl: "https://www.netflix.com/cancelplan",
  },
  {
    name: "Spotify",
    regex: /spotify/i,
    cancelUrl: "https://www.spotify.com/us/account/cancel/",
  },
  {
    name: "Planet Fitness",
    regex: /planet\s*fitness/i,
    supportEmail: "support@planetfitness.com",
    // Gyms famously require mail or physical presence, so an email template is better
  },
  {
    name: "Adobe Creative Cloud",
    regex: /adobe\s*(cc|creative)/i,
    cancelUrl: "https://account.adobe.com/plans",
  }
];

export async function detectSubscriptions(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Mock recent transactions from the database
    const mockTransactions = [
      { id: "tx1", merchant: "Netflix.com", amount: 15.99, date: "2023-10-01" },
      { id: "tx2", merchant: "Uber Eats", amount: 24.50, date: "2023-10-02" },
      { id: "tx3", merchant: "PLANET FITNESS 123", amount: 39.99, date: "2023-10-15" },
      { id: "tx4", merchant: "Spotify USA", amount: 10.99, date: "2023-10-21" },
    ];

    const activeSubscriptions = [];

    // Regex matching on transaction history
    for (const tx of mockTransactions) {
      for (const provider of PROVIDERS_DB) {
        if (provider.regex.test(tx.merchant)) {
          
          let actionUrl = provider.cancelUrl || "";
          
          if (provider.supportEmail) {
            const subject = encodeURIComponent(`Cancellation Request for Account associated with ${user.email}`);
            const body = encodeURIComponent(`Hello,\n\nPlease cancel my subscription immediately.\n\nThank you.`);
            actionUrl = `mailto:${provider.supportEmail}?subject=${subject}&body=${body}`;
          }

          activeSubscriptions.push({
            id: tx.id,
            providerName: provider.name,
            lastBilled: tx.amount,
            date: tx.date,
            actionUrl,
            actionType: provider.cancelUrl ? "web" : "email"
          });
          
          break; // move to next tx if matched
        }
      }
    }

    res.json({
      success: true,
      data: activeSubscriptions
    });

  } catch (error: any) {
    logger.error("SUBSCRIPTION_DETECT_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to detect subscriptions" });
  }
}
