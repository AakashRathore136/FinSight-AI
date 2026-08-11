export interface SensitivityVariable {
  key: string;
  name: string;
  baselineValue: number;
  unit: "%" | "$" | "pts";
  lowSwingImpact: number; // Impact on Net Profit when variable decreases 20%
  highSwingImpact: number; // Impact on Net Profit when variable increases 20%
}

/**
 * Calculates sensitivity impacts for baseline operational drivers.
 */
export function calculateSensitivityDrivers(
  revenue: number = 1000000,
  cogs: number = 600000,
  opex: number = 200000,
  interestRate: number = 5
): SensitivityVariable[] {
  const baseNetProfit = revenue - cogs - opex - (revenue * (interestRate / 100));

  return [
    {
      key: "revenue",
      name: "Revenue Volume",
      baselineValue: revenue,
      unit: "$",
      lowSwingImpact: Math.round((revenue * 0.8 - cogs - opex) - baseNetProfit),
      highSwingImpact: Math.round((revenue * 1.2 - cogs - opex) - baseNetProfit),
    },
    {
      key: "cogs",
      name: "Cost of Goods Sold (COGS)",
      baselineValue: cogs,
      unit: "$",
      lowSwingImpact: Math.round((revenue - cogs * 0.8 - opex) - baseNetProfit),
      highSwingImpact: Math.round((revenue - cogs * 1.2 - opex) - baseNetProfit),
    },
    {
      key: "opex",
      name: "Operating Expenses (OPEX)",
      baselineValue: opex,
      unit: "$",
      lowSwingImpact: Math.round((revenue - cogs - opex * 0.8) - baseNetProfit),
      highSwingImpact: Math.round((revenue - cogs - opex * 1.2) - baseNetProfit),
    },
    {
      key: "interestRate",
      name: "Benchmark Interest Rate",
      baselineValue: interestRate,
      unit: "%",
      lowSwingImpact: Math.round((revenue * (0.02 / 100))),
      highSwingImpact: Math.round(-(revenue * (0.02 / 100))),
    },
  ];
}
