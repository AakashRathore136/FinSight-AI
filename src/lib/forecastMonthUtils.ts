/**
 * Shared forecast-month conventions (issue #900).
 *
 * Both forecast engines (cash flow vs forecast comparison) must agree on what
 * counts as a "forecast" month. The single convention used across the app:
 * forecast months start at the NEXT calendar month — a partial current month is
 * never projected; the current month is always treated as history.
 */

export const FORECAST_WINDOW_MONTHS = 6;

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns the next `count` calendar-month keys ("yyyy-MM"), starting one month
 * after `now`. The current calendar month is intentionally excluded so a
 * partially-elapsed month is never labelled "projected".
 */
export function getForecastMonths(
  count: number = FORECAST_WINDOW_MONTHS,
): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    months.push(monthKey(d));
  }
  return months;
}
