export const MAJOR_CURRENCIES = [

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', flag: '🇭🇰' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', flag: '🇲🇽' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', flag: '🇸🇦' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
];

export const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 95,
  JPY: 149.45,
  CAD: 1.36,
  AUD: 1.52,
  CHF: 0.88,
  CNY: 7.24,
  SGD: 1.34,
  HKD: 7.82,
  NZD: 1.65,
  SEK: 10.42,
  NOK: 10.58,
  MXN: 17.15,
  BRL: 4.97,
  ZAR: 18.65,
  AED: 3.67,
  SAR: 3.75,
  TRY: 30.25,
};

// Snapshot date of FALLBACK_RATES above. Fallback responses report this date
// (NOT today) so stale data is never presented as fresh, and the UI can warn
// the user. Update it whenever FALLBACK_RATES is refreshed. (Issue #1037)
export const FALLBACK_RATES_DATE = '2024-11-01';

export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  /** 'live' when fetched from the Frankfurter API, 'fallback' when the static
   * table was returned after retries were exhausted. (Issue #1037) */
  source: 'live' | 'fallback';
}

export interface ConversionHistoryEntry {
  baseCurrency: string;
  rates: Record<string, number>;
}

export interface CurrencySettings {
  userId: string;
  baseCurrency: string;
  supportedCurrencies: string[];
  lastRateUpdate: string;
  // Entries may still be the legacy flat { [currency]: rate } shape for docs
  // written before per-entry base currencies were stored.
  conversionHistory: Record<string, Record<string, number> | ConversionHistoryEntry>;
}

/**
 * Fetches live exchange rates from the Frankfurter API with retry logic
 * and a graceful fallback to static rates when all retries are exhausted.
 */
export async function fetchExchangeRates(
  base: string = 'USD',
): Promise<ExchangeRates> {
  const maxRetries = 2;
  const timeoutMs = 5000;
  const retryDelayMs = 1000;

  const buildFallbackRates = (): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const [code, rate] of Object.entries(FALLBACK_RATES)) {
      if (code === base) {
        result[code] = 1;
      } else if (base === 'USD') {
        result[code] = rate;
      } else {
        const usdRate = FALLBACK_RATES[code] || 1;
        const baseUsdRate = FALLBACK_RATES[base] || 1;
        result[code] = usdRate / baseUsdRate;
      }
    }
    return result;
  };

  const tryFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(
        `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`,
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await tryFetch();

      if (!response.ok) {
        throw new Error(`Frankfurter API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        base: data.base || base,
        date: data.date || new Date().toISOString().split('T')[0],
        rates: { [data.base || base]: 1, ...(data.rates || {}) },
        source: 'live',
      };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        console.warn(
          `[currencyUtils] All ${maxRetries + 1} attempts to fetch live exchange rates failed. ` +
          `Falling back to static rates (snapshot ${FALLBACK_RATES_DATE}). Last error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          base,
          date: FALLBACK_RATES_DATE,
          rates: buildFallbackRates(),
          source: 'fallback',
        };
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  // Safety fallback — should never reach here but satisfies TypeScript
  return {
    base,
    date: FALLBACK_RATES_DATE,
    rates: buildFallbackRates(),
    source: 'fallback',
  };
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number | null {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  // Never silently assume a 1:1 rate: a currency missing from the rates table
  // (or with a non-positive rate) cannot be converted and is reported as null
  // so callers can skip or flag it instead of folding a wrong value in.
  if (typeof fromRate !== "number" || typeof toRate !== "number") return null;
  if (fromRate <= 0 || toRate <= 0) return null;
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}

export function aggregateMultiCurrencyTotals(
  transactions: Array<{ amount: number; currency: string }>,
  baseCurrency: string,
  rates: Record<string, number>
): { totalBase: number; byCurrency: Record<string, number> } {
  const byCurrency: Record<string, number> = {};
  let totalBase = 0;

  for (const tx of transactions) {
    const converted = convertAmount(tx.amount, tx.currency, baseCurrency, rates);
    // Skip currencies with no known rate instead of silently counting them at
    // parity and corrupting the base-currency totals.
    if (converted === null) continue;
    byCurrency[tx.currency] = (byCurrency[tx.currency] || 0) + converted;
    totalBase += converted;
  }

  return { totalBase, byCurrency };
}

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG', 'GNF', 'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF']);

/**
 * Formats an amount for display in the given currency code.
 * Zero-decimal currencies (JPY, KRW, VND, etc.) are displayed without
 * fraction digits; all other currencies default to 2 fraction digits.
 */
export function formatCurrencyDisplay(amount: number, currencyCode: string): string {
  const currency = MAJOR_CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = currency?.symbol || currencyCode;
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch (err) {
    console.error("formatCurrency: failed to format currency", err);
    return `${symbol}${amount.toFixed(decimals)}`;
  }
}

export function getCurrencySymbol(currencyCode: string): string {
  const currency = MAJOR_CURRENCIES.find((c) => c.code === currencyCode);
  return currency?.symbol || currencyCode;
}
