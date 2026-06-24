import { clsx, type ClassValue } from "clsx"
import { formatDistanceToNow } from "date-fns"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  } catch {
    return fallback;
  }
}
