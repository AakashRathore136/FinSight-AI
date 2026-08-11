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
 */
export function auditFinancialData(
  transactions: AuditTransaction[],
): ComplianceScore {
  const violations: ComplianceViolation[] = [];

  // Amounts are compared with Math.abs so the rules work for both signed
  // storage (negative expenses) and unsigned storage (positive amounts with a
  // `type` field), consistent with anomalyUtils/reportUtils.

  // AML Rule 1: Structuring / Smurfing detection (multiple transactions just under $10,000 threshold)
  const structuringTxns = transactions.filter(
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
  const largeExpenses = transactions.filter(
    (t) => Math.abs(t.amount) > 25000 && isExpenseTransaction(t),
  );
  const largeIncomes = transactions.filter(
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
  const unclassifiedLarge = transactions.filter(
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
