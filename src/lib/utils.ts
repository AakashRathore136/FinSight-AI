/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNow } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Only http(s) URLs are safe to render in an <a href>. Rejects javascript:,
// data:, vbscript: and other schemes that could execute in a link.
export function isSafeExternalUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// Default currency - should be updated based on user preferences
let defaultCurrency = 'USD';

export function safeJsonParse<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}


export function setDefaultCurrency(currency: string): void {
  defaultCurrency = currency;
}

export function getDefaultCurrency(): string {
  return defaultCurrency;
}

export function formatCurrency(amount: number, currency?: string): string {
  const currencyCode = currency || defaultCurrency;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Canonical transaction type shared by every reader. Transactions written
// without a `type` field (legacy manual entries) default to "expense" so all
// dashboards classify them identically instead of inferring divergent types.
export function normalizeTransactionType(
  value: unknown,
): "income" | "expense" {
  return value === "income" ? "income" : "expense";
}

export function toDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateSafe(
  value: any,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  fallback = "Unknown",
) {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(undefined, options);
}

export function formatRelativeTime(value: any, fallback = "Recently") {
  const date = toDate(value);
  if (!date) return fallback;

  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (err) {
    console.error("formatRelativeTime: failed to compute relative time", err);
    return fallback;
  }
}

export function getSharedDocId(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("docId") || sessionStorage.getItem("fin_shared_docId");
}

export function setSharedDocId(id: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("fin_shared_docId", id);
  const url = new URL(window.location.href);
  url.searchParams.set("docId", id);
  window.history.replaceState({}, "", url.toString());
}

export function clearSharedDocId() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("fin_shared_docId");
  const url = new URL(window.location.href);
  url.searchParams.delete("docId");
  window.history.replaceState({}, "", url.toString());
}

export function csvEscape(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}


