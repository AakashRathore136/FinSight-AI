import logger from "../lib/logger.js";

// A mock service replacing external calls to OpenExchangeRates or Fixer.io
// In a real implementation, we would cache these rates in Redis and fetch them daily
const getLiveRates = async (base: string = 'USD') => {
  // Simulating network delay
  await new Promise(resolve => setTimeout(resolve, 600));

  // Mock rates relative to USD
  const rates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 149.50,
    AUD: 1.52,
    CAD: 1.35
  };

  if (!rates[base]) {
    throw new Error(`Unsupported base currency: ${base}`);
  }

  // Recalculate relative to the requested base currency
  const baseRate = rates[base];
  const normalizedRates: Record<string, number> = {};
  
  for (const [currency, rate] of Object.entries(rates)) {
    normalizedRates[currency] = rate / baseRate;
  }

  return normalizedRates;
};

export async function getAggregatedNetWorth(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Usually fetched from user profile settings
    const targetBaseCurrency = req.query.base || 'USD';

    // Mock accounts fetched from DB (e.g. from Plaid linked items in different countries)
    const userAccounts = [
      { id: "acc_1", name: "Chase Checking", balance: 15400.00, currency: "USD" },
      { id: "acc_2", name: "Monzo UK", balance: 4500.50, currency: "GBP" },
      { id: "acc_3", name: "N26 Germany", balance: 8200.75, currency: "EUR" },
      { id: "acc_4", name: "Rakuten Bank", balance: 500000.00, currency: "JPY" },
    ];

    // Fetch live FX Rates relative to the user's base currency
    const liveRates = await getLiveRates(targetBaseCurrency);

    let totalNetWorth = 0;
    
    // Normalize and map account balances
    const normalizedAccounts = userAccounts.map(acc => {
      const conversionRate = 1 / liveRates[acc.currency]; // e.g. GBP to USD
      const convertedBalance = acc.balance * conversionRate;
      
      totalNetWorth += convertedBalance;

      return {
        ...acc,
        conversionRate: parseFloat(conversionRate.toFixed(4)),
        convertedBalance: parseFloat(convertedBalance.toFixed(2))
      };
    });

    res.json({
      success: true,
      data: {
        baseCurrency: targetBaseCurrency,
        totalNetWorth: parseFloat(totalNetWorth.toFixed(2)),
        accounts: normalizedAccounts,
        ratesTimestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error("FX_AGGREGATION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to calculate multi-currency net worth" });
  }
}
