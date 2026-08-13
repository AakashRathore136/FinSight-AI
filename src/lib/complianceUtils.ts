export interface ComplianceViolation {
  id: string;
  category: "AML" | "SOX" | "FINRA" | "FATCA";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  transactionReference?: string;
  recommendedAction: string;
}

export interface ComplianceScore {
  score: number; // 0 to 100
  status: "COMPLIANT" | "NEEDS_REVIEW" | "NON_COMPLIANT";
  criticalViolationsCount: number;
  warningsCount: number;
  violations: ComplianceViolation[];
}

export interface AuditTransaction {
  amount: number;
  description: string;
  date: string | Date;
  category?: string;
  type?: "income" | "expense";
}

const STRUCTURING_WINDOW_DAYS = 7;
const ROUND_TRIP_WINDOW_DAYS = 7;

function parseAuditDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeAmount(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function isExpenseTransaction(
  amount: number,
  type?: "income" | "expense",
): boolean {
  if (type === "expense") return true;
  if (type === "income") return false;
  return amount < 0;
}

/**
 * Scans financial transactions and documents for AML and SOX compliance issues.
 */
export function auditFinancialData(
  transactions: AuditTransaction[],
): ComplianceScore {
  const violations: ComplianceViolation[] = [];

  // Parse and validate every transaction up front. Malformed amounts/dates must
  // be surfaced as data-quality violations, never silently skipped or coerced
  // to "today".
  const parsed = transactions.map((t) => {
    const amt = normalizeAmount(t.amount);
    const date = parseAuditDate(t.date);
    return { t, amt, date };
  });

  // Data-quality pass: report transactions that cannot be safely evaluated.
  for (const { t, amt, date } of parsed) {
    if (Number.isNaN(amt)) {
      violations.push({
        id: "dq-non-numeric-amount",
        category: "SOX",
        severity: "medium",
        title: "Non-numeric transaction amount",
        description: `Transaction "${t.description}" has a non-numeric amount (${String(t.amount)}) and was excluded from compliance rules.`,
        transactionReference: t.description,
        recommendedAction: "Correct the transaction amount in the source document.",
      });
    } else if (date === null) {
      violations.push({
        id: "dq-invalid-date",
        category: "SOX",
        severity: "medium",
        title: "Missing or invalid transaction date",
        description: `Transaction "${t.description}" has an unparseable date (${String(t.date)}) and was excluded from date-dependent rules.`,
        transactionReference: t.description,
        recommendedAction: "Correct the transaction date in the source document.",
      });
    }
  }

  // Only transactions with a numeric amount participate in the value-based
  // rules. Amounts are compared with Math.abs so the rules work for both signed
  // storage (negative expenses) and unsigned storage (positive amounts with a
  // `type` field), consistent with anomalyUtils/reportUtils.
  const valid = parsed.filter((p) => !Number.isNaN(p.amt));
  // Date-dependent rules additionally require a parseable date.
  const dated = valid.filter(
    (p): p is typeof p & { date: Date } => p.date !== null,
  );

  // AML Rule 1: Structuring / Smurfing detection (multiple transactions just under $10,000 threshold)
  const structuringTxns = dated.filter(
    (p) => Math.abs(p.amt) >= 9000 && Math.abs(p.amt) < 10000,
  );
  if (structuringTxns.length >= 2) {
    // Only flag when the transactions actually occur in close succession.
    const inCloseSuccession = structuringTxns.some((p, i) =>
      structuringTxns.slice(i + 1).some(
        (other) => daysBetween(p.date, other.date) <= STRUCTURING_WINDOW_DAYS,
      ),
    );
    if (inCloseSuccession) {
      violations.push({
        id: "aml-structuring-01",
        category: "AML",
        severity: "high",
        title: "Potential Transaction Structuring Detected",
        description: `Identified ${structuringTxns.length} transactions between $9,000 and $9,999 within ${STRUCTURING_WINDOW_DAYS} days of each other.`,
        recommendedAction:
          "File a Currency Transaction Report (CTR) / Suspicious Activity Report (SAR) with FinCEN.",
      });
    }
  }

  // AML Rule 2: High velocity round-trip transfers (high-value deposit and a
  // rapid withdrawal that actually fall inside the same short window)
  const largeExpenses = dated.filter(
    (p) => Math.abs(p.amt) > 25000 && isExpenseTransaction(p.amt, p.t.type),
  );
  const largeIncomes = dated.filter(
    (p) => Math.abs(p.amt) > 25000 && !isExpenseTransaction(p.amt, p.t.type),
  );
  const roundTripDetected =
    largeIncomes.length > 0 &&
    largeExpenses.length > 0 &&
    largeIncomes.some((inc) =>
      largeExpenses.some(
        (exp) => daysBetween(inc.date, exp.date) <= ROUND_TRIP_WINDOW_DAYS,
      ),
    );
  if (roundTripDetected) {
    violations.push({
      id: "aml-velocity-02",
      category: "AML",
      severity: "medium",
      title: "Rapid Round-Trip Fund Velocity",
      description: `High-value deposits and rapid withdrawals detected within ${ROUND_TRIP_WINDOW_DAYS} days of each other.`,
      recommendedAction:
        "Perform Enhanced Due Diligence (EDD) on counterparty entities.",
    });
  }

  // SOX Rule 1: Off-balance sheet expenditure disclosure
  const unclassifiedLarge = valid.filter(
    (p) =>
      Math.abs(p.amt) > 50000 &&
      (!p.t.category || p.t.category.toLowerCase() === "other"),
  );
  if (unclassifiedLarge.length > 0) {
    violations.push({
      id: "sox-unclassified-01",
      category: "SOX",
      severity: "high",
      title: "Unclassified Major Expenditure (SOX 404)",
      description: `Found ${unclassifiedLarge.length} uncategorized expenditure(s) exceeding $50,000 threshold.`,
      recommendedAction: "Reclassify expenditure under GAAP ledger accounts and obtain controller approval.",
    });
  }

  // FINRA Rule: Weekend and after-hours transaction flag. The app's
  // transaction data is date-only (no time-of-day), so the after-hours clause
  // must not be assumed: it only applies when the raw value actually carries an
  // HH:mm time. Transactions with an unparseable date are excluded here (and
  // reported as a data-quality violation above) rather than coerced to today.
  const suspiciousDates = dated.filter((p) => {
    const d = p.date;
    const day = d.getDay();
    if (day === 0 || day === 6) return true; // weekend
    const hasExplicitTime =
      typeof p.t.date === "string"
        ? /\d{1,2}:\d{2}/.test(p.t.date)
        : d.getHours() !== 0 || d.getMinutes() !== 0;
    if (!hasExplicitTime) return false; // no time-of-day in the data
    const hours = d.getHours();
    if (hours < 9 || hours >= 17) return true; // outside business hours
    return false;
  });
  if (suspiciousDates.length > 0) {
    violations.push({
      id: "finra-hours-01",
      category: "FINRA",
      severity: "medium",
      title: "Transactions Outside Business Hours",
      description: `Found ${suspiciousDates.length} transaction(s) occurring on weekends or outside standard business hours (9am-5pm).`,
      recommendedAction: "Verify the legitimacy of after-hours or weekend transactions with the originating client.",
    });
  }

  const highCount = violations.filter((v) => v.severity === "high").length;
  const medCount = violations.filter((v) => v.severity === "medium").length;

  let score = 100 - highCount * 30 - medCount * 15;
  score = Math.max(0, Math.min(100, score));

  let status: "COMPLIANT" | "NEEDS_REVIEW" | "NON_COMPLIANT" = "COMPLIANT";
  if (score < 50) status = "NON_COMPLIANT";
  else if (score < 85) status = "NEEDS_REVIEW";

  return {
    score,
    status,
    criticalViolationsCount: highCount,
    warningsCount: medCount,
    violations,
  };
}
