// Tax utility functions for the Regional Tax Estimation Assistant.
// Bracket data is simplified for estimation/educational purposes only.

export interface TaxBracket {
  threshold: number; // upper bound of this bracket (income up to this amount)
  rate: number; // marginal rate (0-1) applied to income within this bracket
}

export interface RegionTaxData {
  code: string;
  name: string;
  currency: string;
  federalBrackets?: TaxBracket[];
  stateBrackets?: TaxBracket[];
  localRate?: number; // flat local/ municipal rate (0-1)
  notes?: string;
}

export interface CountryTaxData {
  code: string;
  name: string;
  flag: string;
  currency: string;
  regions: RegionTaxData[];
}

export interface TaxBreakdown {
  country: string;
  region: string;
  income: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  totalTax: number;
  effectiveRate: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Simplified tax bracket data (illustrative only, not tax advice)
// ---------------------------------------------------------------------------

export const COUNTRY_TAX_DATA: CountryTaxData[] = [
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    regions: [
      {
        code: 'US-FED',
        name: 'Federal (No State)',
        currency: 'USD',
        federalBrackets: [
          { threshold: 11600, rate: 0.10 },
          { threshold: 47150, rate: 0.12 },
          { threshold: 100525, rate: 0.22 },
          { threshold: 191950, rate: 0.24 },
          { threshold: 383900, rate: 0.32 },
          { threshold: 487450, rate: 0.35 },
          { threshold: Infinity, rate: 0.37 },
        ],
      },
      {
        code: 'US-CA',
        name: 'California',
        currency: 'USD',
        federalBrackets: [
          { threshold: 11600, rate: 0.10 },
          { threshold: 47150, rate: 0.12 },
          { threshold: 100525, rate: 0.22 },
          { threshold: 191950, rate: 0.24 },
          { threshold: 383900, rate: 0.32 },
          { threshold: 487450, rate: 0.35 },
          { threshold: Infinity, rate: 0.37 },
        ],
        stateBrackets: [
          { threshold: 10099, rate: 0.01 },
          { threshold: 23942, rate: 0.02 },
          { threshold: 37788, rate: 0.04 },
          { threshold: 52455, rate: 0.06 },
          { threshold: 66295, rate: 0.08 },
          { threshold: 338639, rate: 0.093 },
          { threshold: 406364, rate: 0.103 },
          { threshold: 677275, rate: 0.113 },
          { threshold: Infinity, rate: 0.123 },
        ],
      },
      {
        code: 'US-TX',
        name: 'Texas',
        currency: 'USD',
        federalBrackets: [
          { threshold: 11600, rate: 0.10 },
          { threshold: 47150, rate: 0.12 },
          { threshold: 100525, rate: 0.22 },
          { threshold: 191950, rate: 0.24 },
          { threshold: 383900, rate: 0.32 },
          { threshold: 487450, rate: 0.35 },
          { threshold: Infinity, rate: 0.37 },
        ],
        notes: 'Texas has no state income tax.',
      },
      {
        code: 'US-NY',
        name: 'New York',
        currency: 'USD',
        federalBrackets: [
          { threshold: 11600, rate: 0.10 },
          { threshold: 47150, rate: 0.12 },
          { threshold: 100525, rate: 0.22 },
          { threshold: 191950, rate: 0.24 },
          { threshold: 383900, rate: 0.32 },
          { threshold: 487450, rate: 0.35 },
          { threshold: Infinity, rate: 0.37 },
        ],
        stateBrackets: [
          { threshold: 8500, rate: 0.04 },
          { threshold: 11700, rate: 0.045 },
          { threshold: 13900, rate: 0.0525 },
          { threshold: 80650, rate: 0.059 },
          { threshold: 215400, rate: 0.0633 },
          { threshold: 1077550, rate: 0.0685 },
          { threshold: Infinity, rate: 0.0965 },
        ],
      },
    ],
  },
  {
    code: 'UK',
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    regions: [
      {
        code: 'UK-ENG',
        name: 'England & NI',
        currency: 'GBP',
        federalBrackets: [
          { threshold: 12570, rate: 0.0 },
          { threshold: 50270, rate: 0.20 },
          { threshold: 125140, rate: 0.40 },
          { threshold: Infinity, rate: 0.45 },
        ],
      },
      {
        code: 'UK-SCT',
        name: 'Scotland',
        currency: 'GBP',
        federalBrackets: [
          { threshold: 12570, rate: 0.0 },
          { threshold: 14876, rate: 0.19 },
          { threshold: 26561, rate: 0.20 },
          { threshold: 43662, rate: 0.21 },
          { threshold: 125140, rate: 0.42 },
          { threshold: Infinity, rate: 0.47 },
        ],
      },
    ],
  },
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    regions: [
      {
        code: 'IN-NEW',
        name: 'New Regime',
        currency: 'INR',
        federalBrackets: [
          { threshold: 300000, rate: 0.0 },
          { threshold: 700000, rate: 0.05 },
          { threshold: 1000000, rate: 0.10 },
          { threshold: 1200000, rate: 0.15 },
          { threshold: 1500000, rate: 0.20 },
          { threshold: Infinity, rate: 0.30 },
        ],
        notes: 'New regime with standard deduction ₹75,000 (not applied here).',
      },
      {
        code: 'IN-OLD',
        name: 'Old Regime',
        currency: 'INR',
        federalBrackets: [
          { threshold: 250000, rate: 0.0 },
          { threshold: 500000, rate: 0.05 },
          { threshold: 1000000, rate: 0.20 },
          { threshold: Infinity, rate: 0.30 },
        ],
        notes: 'Old regime assumes no deductions for simplicity.',
      },
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    regions: [
      {
        code: 'CA-FED',
        name: 'Federal (No Province)',
        currency: 'CAD',
        federalBrackets: [
          { threshold: 55867, rate: 0.15 },
          { threshold: 111733, rate: 0.205 },
          { threshold: 173205, rate: 0.26 },
          { threshold: 246752, rate: 0.29 },
          { threshold: Infinity, rate: 0.33 },
        ],
      },
      {
        code: 'CA-ON',
        name: 'Ontario',
        currency: 'CAD',
        federalBrackets: [
          { threshold: 55867, rate: 0.15 },
          { threshold: 111733, rate: 0.205 },
          { threshold: 173205, rate: 0.26 },
          { threshold: 246752, rate: 0.29 },
          { threshold: Infinity, rate: 0.33 },
        ],
        stateBrackets: [
          { threshold: 51446, rate: 0.0505 },
          { threshold: 102894, rate: 0.0915 },
          { threshold: 150000, rate: 0.1116 },
          { threshold: 220000, rate: 0.1216 },
          { threshold: Infinity, rate: 0.1316 },
        ],
      },
      {
        code: 'CA-AB',
        name: 'Alberta',
        currency: 'CAD',
        federalBrackets: [
          { threshold: 55867, rate: 0.15 },
          { threshold: 111733, rate: 0.205 },
          { threshold: 173205, rate: 0.26 },
          { threshold: 246752, rate: 0.29 },
          { threshold: Infinity, rate: 0.33 },
        ],
        stateBrackets: [
          { threshold: 148269, rate: 0.10 },
          { threshold: 177482, rate: 0.12 },
          { threshold: 236603, rate: 0.13 },
          { threshold: 355845, rate: 0.14 },
          { threshold: Infinity, rate: 0.15 },
        ],
      },
    ],
  },
  {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    currency: 'AUD',
    regions: [
      {
        code: 'AU-FED',
        name: 'Federal',
        currency: 'AUD',
        federalBrackets: [
          { threshold: 18200, rate: 0.0 },
          { threshold: 45000, rate: 0.16 },
          { threshold: 135000, rate: 0.30 },
          { threshold: 190000, rate: 0.37 },
          { threshold: Infinity, rate: 0.45 },
        ],
      },
    ],
  },
  {
    code: 'EU',
    name: 'European Union',
    flag: '🇪🇺',
    currency: 'EUR',
    regions: [
      {
        code: 'EU-DE',
        name: 'Germany',
        currency: 'EUR',
        federalBrackets: [
          { threshold: 11604, rate: 0.0 },
          { threshold: 67004, rate: 0.24 },
          { threshold: 277825, rate: 0.42 },
          { threshold: Infinity, rate: 0.45 },
        ],
        localRate: 0.0,
        notes: 'Solidarity surcharge omitted for simplicity.',
      },
      {
        code: 'EU-FR',
        name: 'France',
        currency: 'EUR',
        federalBrackets: [
          { threshold: 11294, rate: 0.0 },
          { threshold: 28797, rate: 0.11 },
          { threshold: 82341, rate: 0.30 },
          { threshold: 177106, rate: 0.41 },
          { threshold: Infinity, rate: 0.45 },
        ],
      },
      {
        code: 'EU-NL',
        name: 'Netherlands',
        currency: 'EUR',
        federalBrackets: [
          { threshold: 37706, rate: 0.369 },
          { threshold: Infinity, rate: 0.495 },
        ],
      },
    ],
  },
];

export interface TaxEstimateRecord {
  userId: string;
  country: string;
  region: string;
  income: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  totalTax: number;
  effectiveRate: number;
  createdAt: any;
}

// ---------------------------------------------------------------------------
// Calculation helpers
// ---------------------------------------------------------------------------

function applyBrackets(income: number, brackets: TaxBracket[] | undefined): number {
  if (!brackets || income <= 0) return 0;
  let tax = 0;
  let previousThreshold = 0;
  for (const bracket of brackets) {
    if (income < previousThreshold) break;
    const taxableInBracket = Math.min(income, bracket.threshold) - previousThreshold;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.rate;
    }
    previousThreshold = bracket.threshold;
  }
  return tax;
}

export function calculateTax(
  income: number,
  countryCode: string,
  regionCode: string
): TaxBreakdown | null {
  const country = COUNTRY_TAX_DATA.find((c) => c.code === countryCode);
  if (!country) return null;
  const region = country.regions.find((r) => r.code === regionCode);
  if (!region) return null;

  const annualIncome = income > 0 ? income : 0;
  const federalTax = applyBrackets(annualIncome, region.federalBrackets);
  const stateTax = applyBrackets(annualIncome, region.stateBrackets);
  const localTax = region.localRate ? annualIncome * region.localRate : 0;
  const totalTax = federalTax + stateTax + localTax;
  const effectiveRate = annualIncome > 0 ? totalTax / annualIncome : 0;

  return {
    country: country.name,
    region: region.name,
    income: annualIncome,
    federalTax,
    stateTax,
    localTax,
    totalTax,
    effectiveRate,
    currency: region.currency,
  };
}

export function calculateEffectiveRate(totalTax: number, income: number): number {
  if (income <= 0) return 0;
  return totalTax / income;
}

export function generateTaxSummary(breakdown: TaxBreakdown): string {
  const fmt = (n: number) => formatCurrency(n, breakdown.currency);
  const lines = [
    'FinSight AI — Tax Estimation Summary',
    '====================================',
    `Country:  ${breakdown.country}`,
    `Region:   ${breakdown.region}`,
    `Income:   ${fmt(breakdown.income)}`,
    '',
    'Breakdown',
    `  Federal Tax:  ${fmt(breakdown.federalTax)}`,
    `  State Tax:    ${fmt(breakdown.stateTax)}`,
    `  Local Tax:    ${fmt(breakdown.localTax)}`,
    `  Total Tax:    ${fmt(breakdown.totalTax)}`,
    `  Effective Rate: ${(breakdown.effectiveRate * 100).toFixed(2)}%`,
    '',
    'DISCLAIMER: This is a simplified estimate for educational purposes only and does not constitute tax advice.',
  ];
  return lines.join('\n');
}

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (err) {
    console.error("formatCurrency: failed to format currency in taxUtils", err);
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
