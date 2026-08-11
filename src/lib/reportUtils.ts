/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { toDate, formatCurrency } from "@/src/lib/utils";
import { format, startOfDay, endOfDay } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * RFC 4180 CSV field escaping. Wraps values containing a comma, double quote,
 * or newline in double quotes (doubling any inner quotes) and neutralises
 * CSV-injection by prefixing a single quote to values that Excel/Sheets would
 * otherwise interpret as a formula (=, +, -, @, Tab, Carriage Return). Pure
 * numbers (e.g. negative amounts like -50.00) are left untouched.
 */
export function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  const needsQuote = /[",\n\r]/.test(str);
  let escaped = str.replace(/"/g, '""');
  const isNumeric = str.trim() !== "" && Number.isFinite(Number(str));
  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    escaped = "'" + escaped;
  }
  return needsQuote ? `"${escaped}"` : escaped;
}

export interface ReportTransaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  type?: "expense" | "income";
}

export interface ExpenseSummaryItem {
  category: string;
  total: number;
  count: number;
}

export interface IncomeSummaryItem {
  source: string;
  total: number;
  count: number;
}

export interface ReportData {
  userId: string;
  type: "pdf" | "csv";
  dateRange: { start: Date; end: Date };
  transactions: ReportTransaction[];
  expenseSummary: ExpenseSummaryItem[];
  incomeSummary: IncomeSummaryItem[];
  totalIncome: number;
  totalExpenses: number;
  currency?: string;
  createdAt: Date;
}

export function formatDate(value: Date | any): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "dd MMM yyyy");
}

export function formatDateShort(value: Date | any): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "yyyy-MM-dd");
}

export async function fetchTransactionsForDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<ReportTransaction[]> {
  try {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      where("date", ">=", startOfDay(startDate)),
      where("date", "<=", endOfDay(endDate)),
      orderBy("date", "desc"),
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as any;
      const date = toDate(data.date) || new Date();
      return { ...data, id: d.id, date } as ReportTransaction;
    });
  } catch (error) {
    if ((error as any)?.code === "failed-precondition") {
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        orderBy("date", "desc"),
      );
      const snap = await getDocs(q);
      const startTime = startOfDay(startDate).getTime();
      const endTime = endOfDay(endDate).getTime();
      return snap.docs
        .map((d) => {
          const data = d.data() as any;
          const date = toDate(data.date) || new Date();
          return { ...data, id: d.id, date } as ReportTransaction;
        })
        .filter((t) => {
          const time = t.date.getTime();
          return time >= startTime && time <= endTime;
        });
    }
    handleFirestoreError(error, OperationType.LIST, "transactions");
    return [];
  }
}

export function generateExpenseSummary(
  transactions: ReportTransaction[],
): ExpenseSummaryItem[] {
  const expenses = transactions.filter((t) => t.type !== "income");
  const map = new Map<string, { total: number; count: number }>();

  expenses.forEach((t) => {
    const cat = t.category || "Other";
    const existing = map.get(cat) || { total: 0, count: 0 };
    existing.total += Math.abs(t.amount);
    existing.count += 1;
    map.set(cat, existing);
  });

  return Array.from(map.entries())
    .map(([category, values]) => ({
      category,
      total: Math.round(values.total * 100 + Number.EPSILON) / 100,
      count: values.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export function generateIncomeSummary(
  transactions: ReportTransaction[],
): IncomeSummaryItem[] {
  const incomes = transactions.filter((t) => t.type === "income");
  const map = new Map<string, { total: number; count: number }>();

  incomes.forEach((t) => {
    const source = t.category || "Other";
    const existing = map.get(source) || { total: 0, count: 0 };
    existing.total += Math.abs(t.amount);
    existing.count += 1;
    map.set(source, existing);
  });

  return Array.from(map.entries())
    .map(([source, values]) => ({
      source,
      total: Math.round(values.total * 100) / 100,
      count: values.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export function generateCSV(reportData: ReportData): string {
  const lines: string[] = [];
  lines.push("Category,Type,Total Amount,Transaction Count");
  lines.push("Expenses");
  reportData.expenseSummary.forEach((item) => {
    lines.push(
      [csvEscape(item.category), csvEscape("Expense"), csvEscape(item.total.toFixed(2)), csvEscape(item.count)].join(","),
    );
  });
  lines.push("");
  lines.push("Income");
  reportData.incomeSummary.forEach((item) => {
    lines.push(
      [csvEscape(item.source), csvEscape("Income"), csvEscape(item.total.toFixed(2)), csvEscape(item.count)].join(","),
    );
  });
  lines.push("");
  lines.push(
    [
      csvEscape("Summary"),
      csvEscape(""),
      csvEscape(`Total Income:${reportData.totalIncome.toFixed(2)}`),
      csvEscape(`Total Expenses:${reportData.totalExpenses.toFixed(2)}`),
    ].join(","),
  );
  lines.push("");
  lines.push("Transaction Details");
  lines.push("Date,Description,Category,Amount,Type");
  reportData.transactions.forEach((t) => {
    lines.push(
      [
        csvEscape(formatDateShort(t.date)),
        csvEscape(t.description),
        csvEscape(t.category),
        csvEscape(t.amount.toFixed(2)),
        csvEscape(t.type || "expense"),
      ].join(","),
    );
  });
  return lines.join("\n");
}

export function downloadCSV(reportData: ReportData): void {
  const csv = generateCSV(reportData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `financial-report-${formatDateShort(reportData.dateRange.start)}-to-${formatDateShort(reportData.dateRange.end)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function generatePDF(
  reportData: ReportData,
  chartCanvasElements: HTMLCanvasElement[] = [],
): Promise<void> {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  pdf.setFontSize(18);
  pdf.setTextColor(30, 41, 59);
  pdf.text("Financial Report", margin, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `Period: ${formatDate(reportData.dateRange.start)} - ${formatDate(reportData.dateRange.end)}`,
    margin,
    y,
  );
  pdf.text(
    `Generated: ${formatDate(reportData.createdAt)}`,
    margin + pageWidth / 2,
    y,
  );
  y += 10;

  if (y > pageHeight - 40) {
    pdf.addPage();
    y = margin;
  }

  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Summary", margin, y);
  y += 6;

  const currency = reportData.currency || "USD";

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(
    `Total Income: ${formatCurrency(reportData.totalIncome, currency)}`,
    margin,
    y,
  );
  y += 6;
  pdf.text(
    `Total Expenses: ${formatCurrency(reportData.totalExpenses, currency)}`,
    margin,
    y,
  );
  y += 10;

  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Expense Summary by Category", margin, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  reportData.expenseSummary.forEach((item) => {
    if (y > pageHeight - 20) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(
      `${item.category}: ${formatCurrency(item.total, currency)} (${item.count} transactions)`,
      margin + 4,
      y,
    );
    y += 6;
  });
  y += 4;

  if (y > pageHeight - 40) {
    pdf.addPage();
    y = margin;
  }

  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Income Summary by Source", margin, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  reportData.incomeSummary.forEach((item) => {
    if (y > pageHeight - 20) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(
      `${item.source}: ${formatCurrency(item.total, currency)} (${item.count} transactions)`,
      margin + 4,
      y,
    );
    y += 6;
  });
  y += 8;

  for (const chartCanvas of chartCanvasElements) {
    if (y > pageHeight - 80) {
      pdf.addPage();
      y = margin;
    }
    try {
      const canvas = await html2canvas(chartCanvas, {
        backgroundColor: "#0f1219",
        scale: 2,
      });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(
        imgData,
        "PNG",
        margin,
        y,
        imgWidth,
        Math.min(imgHeight, 80),
      );
      y += Math.min(imgHeight, 80) + 8;
    } catch (err) {
      console.error("Failed to capture chart for PDF:", err);
    }
  }

  pdf.save(
    `financial-report-${formatDateShort(reportData.dateRange.start)}-to-${formatDateShort(reportData.dateRange.end)}.pdf`,
  );
}

export function buildReportData(
  userId: string,
  type: "pdf" | "csv",
  startDate: Date,
  endDate: Date,
  transactions: ReportTransaction[],
  expenseSummary: ExpenseSummaryItem[],
  incomeSummary: IncomeSummaryItem[],
  currency: string = "USD",
): ReportData {
  const totalIncome = incomeSummary.reduce((sum, item) => sum + item.total, 0);
  const totalExpenses = expenseSummary.reduce(
    (sum, item) => sum + item.total,
    0,
  );
  return {
    userId,
    type,
    dateRange: { start: startDate, end: endDate },
    transactions,
    expenseSummary,
    incomeSummary,
    totalIncome,
    totalExpenses,
    currency,
    createdAt: new Date(),
  };
}

export async function saveReportToFirestore(
  reportData: ReportData,
): Promise<string | null> {
  try {
    const { doc, setDoc, collection, serverTimestamp } = await import("firebase/firestore");
    const reportsCol = collection(db, "reports");
    const newDocRef = doc(reportsCol);
    const payload: any = {
      userId: reportData.userId,
      type: reportData.type,
      dateRange: {
        start: Timestamp.fromDate(reportData.dateRange.start),
        end: Timestamp.fromDate(reportData.dateRange.end),
      },
      categories: {
        expenses: reportData.expenseSummary,
        income: reportData.incomeSummary,
      },
      totalIncome: reportData.totalIncome,
      totalExpenses: reportData.totalExpenses,
      currency: reportData.currency || "USD",
      // Use serverTimestamp() so createdAt is a Firestore Timestamp, matching
      // dateRange and the other writers in this repo (forecastUtils/anomalyUtils).
      // A mixed string/Timestamp type breaks orderBy/where on this field.
      createdAt: serverTimestamp(),
    };
    await setDoc(newDocRef, payload);
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "reports");
    return null;
  }
}
