import { test } from "node:test";
import assert from "node:assert/strict";

const { calculateSensitivityDrivers } =
  await import("../src/lib/sensitivityUtils.ts");

// interestRateDown / interestRateUp previously computed identical
// lowSwingImpact and highSwingImpact (both used the same multiplier), so the
// sensitivity table showed no directional spread for interest-rate moves.

function find(rows, key) {
  const row = rows.find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

test("interestRateDown has distinct low and high swing impacts (#1136)", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  const down = find(rows, "interestRateDown");
  assert.notEqual(
    down.lowSwingImpact,
    down.highSwingImpact,
    "interestRateDown low and high must differ (previously duplicates)",
  );
});

test("interestRateUp has distinct low and high swing impacts (#1136)", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  const up = find(rows, "interestRateUp");
  assert.notEqual(
    up.lowSwingImpact,
    up.highSwingImpact,
    "interestRateUp low and high must differ (previously duplicates)",
  );
});

test("interestRateDown high swing reflects the -20% rate cut", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  const down = find(rows, "interestRateDown");
  // Lower interest rate => higher net profit => positive swing.
  // low (baseline rate 1.0x) = 0 impact; high (0.8x rate) = positive.
  assert.equal(down.lowSwingImpact, 0);
  assert.ok(down.highSwingImpact > 0, "expected positive swing for lower rate");
});

test("interestRateUp low swing reflects the +20% rate rise", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  const up = find(rows, "interestRateUp");
  // Higher interest rate => lower net profit => negative swing.
  // low (1.2x rate) = negative; high (baseline 1.0x) = 0.
  assert.ok(up.lowSwingImpact < 0, "expected negative swing for higher rate");
  assert.equal(up.highSwingImpact, 0);
});

test("baseline driver rows keep distinct low/high (revenue/cogs/opex)", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  for (const key of ["revenue", "cogs", "opex"]) {
    const row = find(rows, key);
    assert.notEqual(row.lowSwingImpact, row.highSwingImpact, `${key} low/high must differ`);
  }
});

test("interestRateDown and interestRateUp swing in opposite directions", () => {
  const rows = calculateSensitivityDrivers(1_000_000, 600_000, 200_000, 5);
  const down = find(rows, "interestRateDown");
  const up = find(rows, "interestRateUp");
  // The -20% row's high swing should be positive (rate falls), while the +20%
  // row's low swing should be negative (rate rises).
  assert.ok(down.highSwingImpact > 0);
  assert.ok(up.lowSwingImpact < 0);
});
