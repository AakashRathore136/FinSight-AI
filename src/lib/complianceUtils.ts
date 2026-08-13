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

function auditDate(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function isExpenseTransaction(t: AuditTransaction): boolean {
  if (t.type === "expense") return true;
  if (t.type === "income") return false;
  return t.amount < 0;
}

/**
 * Scans financial transactions and documents for AML and SOX compliance issues.
 * Transactions with unparseable amounts or dates are skipped; they do not
 * contribute to the audit score and do not silently corrupt violation results.
 */
export function auditFinancialData(
  transactions: AuditTransaction[],
): ComplianceScore {
  const violations: ComplianceViolation[] = [];

  // Parse-validate every transaction upfront. Skip entries whose amount or date
  // cannot be interpreted rather than silently including them with a fallback
  // value that would corrupt the AML/SOX/FINRA rule checks.
  const valid = transactions.filter((t) => {
    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount)) return false;
    const d = t.date instanceof Date ? t.date : new Date(t.date as string);
    return !isNaN(d.getTime());
  });

  // Amounts are compared with Math.abs so the rules work for both signed
  // storage (negative expenses) and unsigned storage (positive amounts with a
  // `type` field), consistent with anomalyUtils/reportUtils.

  // AML Rule 1: Structuring / Smurfing detection (multiple transactions just under $10,000 threshold)
  const structuringTxns = valid.filter(
    (t) => Math.abs(t.amount) >= 9000 && Math.abs(t.amount) < 10000,
  );
  if (structuringTxns.length >= 2) {
    // Only flag when the transactions actually occur in close succession.
    const inCloseSuccession = structuringTxns.some((t, i) =>
      structuringTxns.slice(i + 1).some(
        (other) =>
          daysBetween(auditDate(t.date), auditDate(other.date)) <=
          STRUCTURING_WINDOW_DAYS,
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
  const largeExpenses = valid.filter(
    (t) => Math.abs(t.amount) > 25000 && isExpenseTransaction(t),
  );
  const largeIncomes = valid.filter(
    (t) => Math.abs(t.amount) > 25000 && !isExpenseTransaction(t),
  );
  const roundTripDetected =
    largeIncomes.length > 0 &&
    largeExpenses.length > 0 &&
    largeIncomes.some((inc) =>
      largeExpenses.some(
        (exp) =>
          daysBetween(auditDate(inc.date), auditDate(exp.date)) <=
          ROUND_TRIP_WINDOW_DAYS,
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
    (t) =>
      Math.abs(t.amount) > 50000 &&
      (!t.category || t.category.toLowerCase() === "other"),
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
  // HH:mm time. Previously `new Date(t.date + 'T00:00:00')` flagged every
  // date-only row as after-hours (midnight hours < 9), while `Date` objects
  // stringified to an Invalid Date and never fired. Weekend detection works on
  // the date alone.
  const suspiciousDates = valid.filter((t) => {
    const d = auditDate(t.date);
    const day = d.getDay();
    if (day === 0 || day === 6) return true; // weekend
    const hasExplicitTime =
      typeof t.date === "string"
        ? /\d{1,2}:\d{2}/.test(t.date)
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
