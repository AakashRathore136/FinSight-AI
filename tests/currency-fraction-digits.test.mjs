import { test } from "node:test";
import assert from "node:assert/strict";

const { formatCurrencyDisplay, getCurrencyMinorUnits } =
  await import("../src/lib/currencyUtils.ts");

// formatCurrencyDisplay must honour each currency's ISO 4217 minor units
// instead of forcing 2 fraction digits for every currency. Zero-decimal
// currencies (JPY/KRW/CLP/VND) must render with no cents, two-decimal
// currencies (USD/EUR/GBP) keep 2, and three-decimal currencies (BHD/KWD)
// keep 3.

test("formatCurrencyDisplay renders zero-decimal currencies without cents (#1182)", () => {
  const jpy = formatCurrencyDisplay(100, "JPY");
  assert.ok(
    !/\.\d/.test(jpy),
    `JPY must not show fractional digits, got: ${jpy}`,
  );

  const krw = formatCurrencyDisplay(50000, "KRW");
  assert.ok(
    !/\.\d/.test(krw),
    `KRW must not show fractional digits, got: ${krw}`,
  );
});

test("formatCurrencyDisplay keeps 2 decimals for typical currencies", () => {
  const usd = formatCurrencyDisplay(42.5, "USD");
  assert.match(usd, /\.\d{2}/, `USD should show 2 fractional digits, got: ${usd}`);

  const eur = formatCurrencyDisplay(9.99, "EUR");
  assert.match(eur, /\.\d{2}/, `EUR should show 2 fractional digits, got: ${eur}`);
});

test("formatCurrencyDisplay keeps 3 decimals for BHD/KWD", () => {
  const bhd = formatCurrencyDisplay(12.3456, "BHD");
  assert.match(bhd, /\.\d{3}/, `BHD should show 3 fractional digits, got: ${bhd}`);
});

test("formatCurrencyDisplay does not hardcode minimum/maximumFractionDigits: 2", () => {
  // Sanity: JPY value like 100 must not equal "¥100.00"
  const jpy = formatCurrencyDisplay(100, "JPY");
  assert.ok(
    !jpy.includes(".00"),
    `JPY 100 must not end with ".00", got: ${jpy}`,
  );
});

test("getCurrencyMinorUnits returns 0 for zero-decimal currencies", () => {
  for (const code of ["JPY", "KRW", "CLP", "VND", "ISK", "UGX"]) {
    assert.equal(getCurrencyMinorUnits(code), 0, `${code} should be 0 minor units`);
  }
});

test("getCurrencyMinorUnits returns 3 for three-decimal currencies", () => {
  for (const code of ["BHD", "KWD", "JOD", "OMR", "TND"]) {
    assert.equal(getCurrencyMinorUnits(code), 3, `${code} should be 3 minor units`);
  }
});

test("getCurrencyMinorUnits defaults to 2 for typical and unknown currencies", () => {
  assert.equal(getCurrencyMinorUnits("USD"), 2);
  assert.equal(getCurrencyMinorUnits("EUR"), 2);
  assert.equal(getCurrencyMinorUnits("INR"), 2);
  assert.equal(getCurrencyMinorUnits("ZZZ"), 2);
});
