import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mergeCollectionAndEmbeddedHoldings(collectionHoldings, embeddedHoldings) {
  const byId = new Map();
  const symbols = new Set();

  for (const h of collectionHoldings) {
    byId.set(h.id, h);
    if (h.symbol) symbols.add(h.symbol.toUpperCase());
  }

  for (const h of embeddedHoldings) {
    if (!h.id || byId.has(h.id)) continue;
    const symbolKey = (h.symbol || "").toUpperCase();
    if (symbolKey && symbols.has(symbolKey)) continue;
    byId.set(h.id, h);
    if (symbolKey) symbols.add(symbolKey);
  }

  return Array.from(byId.values());
}

test("merge keeps collection holdings and unique embedded holdings", () => {
  const collection = [
    { id: "c1", symbol: "AAPL", name: "Apple", quantity: 1 },
  ];
  const embedded = [
    { id: "c1", symbol: "AAPL", name: "Apple embedded duplicate", quantity: 9 },
    { id: "e1", symbol: "MSFT", name: "Microsoft", quantity: 2 },
    { id: "e2", symbol: "aapl", name: "Apple lower", quantity: 3 },
  ];

  const merged = mergeCollectionAndEmbeddedHoldings(collection, embedded);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((h) => h.id === "c1")?.quantity, 1);
  assert.ok(merged.some((h) => h.id === "e1" && h.symbol === "MSFT"));
  assert.equal(merged.some((h) => h.id === "e2"), false);
});

test("add holding path writes to portfolioHoldings, not embedded portfolio.holdings", () => {
  const tracker = readFileSync(
    path.join(repoRoot, "src/components/portfolio/PortfolioTracker.tsx"),
    "utf8",
  );
  const utils = readFileSync(path.join(repoRoot, "src/lib/portfolioUtils.ts"), "utf8");

  assert.match(utils, /collection\(db, ['"]portfolioHoldings['"]\)/);
  assert.match(utils, /export async function addHolding/);
  assert.match(utils, /export async function migrateEmbeddedHoldings/);
  assert.match(tracker, /await addHolding\(/);
  assert.match(tracker, /migrateEmbeddedHoldings/);
  assert.doesNotMatch(
    tracker,
    /updatePortfolio\([^)]*holdings\s*:/,
  );
});
