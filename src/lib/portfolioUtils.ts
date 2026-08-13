/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  deleteDoc,
  runTransaction,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { toDate } from './utils';
import { convertAmount } from './currencyUtils';

export type AssetClass = 'equities' | 'fixed_income' | 'real_estate' | 'commodities' | 'crypto' | 'cash';

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal';

export interface Holding {
  id: string;
  userId: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  holdingId: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  notes?: string;
  date: string;
  createdAt: string;
}

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description?: string;
  holdings: Holding[];
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetAllocation {
  assetClass: AssetClass;
  value: number;
  percentage: number;
}

export interface PerformanceMetrics {
  totalValue: number;
  totalCost: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
  bestPerformer: { symbol: string; returnPercent: number } | null;
  worstPerformer: { symbol: string; returnPercent: number } | null;
}

export interface PortfolioSummary extends PerformanceMetrics {
  holdingsCount: number;
  transactionsCount: number;
  allocation: AssetAllocation[];
  topHoldings: Array<{ symbol: string; name: string; value: number; weight: number }>;
}

export interface HoldingInput {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  currency?: string;
}

export interface TransactionInput {
  holdingId: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  notes?: string;
  date: string;
  /** Optional asset class for the new holding created by a first buy. When
   * omitted, addTransaction infers it from the symbol. (Issue #1030) */
  assetClass?: AssetClass;
}

// Well-known symbols that are not equities. Anything unrecognized defaults to
// 'equities' so stock buys keep working without an explicit asset class.
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'MATIC',
  'LTC', 'BNB', 'USDT', 'USDC', 'UNI', 'AAVE', 'SHIB', 'XLM', 'TRX', 'TON',
]);

/** Infers an asset class for a symbol (e.g. BTC → crypto) when a transaction
 * does not provide one. Defaults to 'equities'. (Issue #1030) */
export function inferAssetClass(symbol: string): AssetClass {
  const upper = (symbol || '').trim().toUpperCase();
  if (CRYPTO_SYMBOLS.has(upper)) return 'crypto';
  return 'equities';
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equities: 'Equities',
  fixed_income: 'Fixed Income',
  real_estate: 'Real Estate',
  commodities: 'Commodities',
  crypto: 'Crypto',
  cash: 'Cash',
};

export function getAssetClassColor(assetClass: AssetClass): string {
  const colors: Record<AssetClass, string> = {
    equities: '#6366f1',
    fixed_income: '#8b5cf6',
    real_estate: '#14b8a6',
    commodities: '#f59e0b',
    crypto: '#ec4899',
    cash: '#64748b',
  };
  return colors[assetClass];
}

export function calculateTotalValue(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
}

/**
 * Value of a single holding expressed in the user's base currency. When
 * `rates` and `baseCurrency` are supplied each holding is converted via
 * `convertAmount` (USD-base FX table) before it is summed, so multi-currency
 * portfolios no longer treat every local-currency amount as if it were the
 * base currency. Holdings whose currency is missing from the rate table fall
 * back to their raw local value rather than being dropped, so totals stay
 * stable when a rate is temporarily unavailable.
 */
function holdingBaseValue(
  holding: Holding,
  rates?: Record<string, number>,
  baseCurrency?: string,
): number {
  const local = holding.quantity * holding.currentPrice;
  if (!rates || !baseCurrency || !holding.currency || holding.currency === baseCurrency) {
    return local;
  }
  const converted = convertAmount(local, holding.currency, baseCurrency, rates);
  return converted == null ? local : converted;
}

export function calculateTotalValue(
  holdings: Holding[],
  rates?: Record<string, number>,
  baseCurrency?: string,
): number {
  return holdings.reduce((sum, h) => sum + holdingBaseValue(h, rates, baseCurrency), 0);
}

export function calculateProfitLoss(holding: Holding): { value: number; percent: number } {
  const value = (holding.currentPrice - holding.avgCost) * holding.quantity;
  const percent = holding.avgCost > 0 ? ((holding.currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0;
  return { value, percent };
}

export function calculateAllocation(
  holdings: Holding[],
  rates?: Record<string, number>,
  baseCurrency?: string,
): AssetAllocation[] {
  const totalValue = calculateTotalValue(holdings, rates, baseCurrency);
  if (totalValue === 0) return [];

  const classMap = new Map<AssetClass, number>();
  holdings.forEach((h) => {
    const value = holdingBaseValue(h, rates, baseCurrency);
    classMap.set(h.assetClass, (classMap.get(h.assetClass) || 0) + value);
  });

  return Array.from(classMap.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      percentage: (value / totalValue) * 100,
    }))
    .sort((a, b) => b.value - a.value);
}

export function calculatePerformance(
  holdings: Holding[],
  rates?: Record<string, number>,
  baseCurrency?: string,
): PerformanceMetrics {
  const totalValue = calculateTotalValue(holdings, rates, baseCurrency);
  const totalCost = holdings.reduce(
    (sum, h) => sum + holdingBaseValue({ ...h, currentPrice: h.avgCost }, rates, baseCurrency),
    0,
  );
  const totalProfitLoss = totalValue - totalCost;
  const totalProfitLossPercent = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  let bestPerformer: { symbol: string; returnPercent: number } | null = null;
  let worstPerformer: { symbol: string; returnPercent: number } | null = null;

  holdings.forEach((h) => {
    const returnPercent = h.avgCost > 0 ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0;
    if (!bestPerformer || returnPercent > bestPerformer.returnPercent) {
      bestPerformer = { symbol: h.symbol, returnPercent };
    }
    if (!worstPerformer || returnPercent < worstPerformer.returnPercent) {
      worstPerformer = { symbol: h.symbol, returnPercent };
    }
  });

  return {
    totalValue,
    totalCost,
    totalProfitLoss,
    totalProfitLossPercent,
    dayChange: 0,
    dayChangePercent: 0,
    bestPerformer,
    worstPerformer,
  };
}

export function generatePortfolioSummary(
  holdings: Holding[],
  transactions: Transaction[],
  rates?: Record<string, number>,
  baseCurrency?: string,
): PortfolioSummary {
  const metrics = calculatePerformance(holdings, rates, baseCurrency);
  const allocation = calculateAllocation(holdings, rates, baseCurrency);

  const topHoldings = holdings
    .map((h) => {
      const value = holdingBaseValue(h, rates, baseCurrency);
      return {
        symbol: h.symbol,
        name: h.name,
        value,
        weight: metrics.totalValue > 0 ? value / metrics.totalValue : 0,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    ...metrics,
    holdingsCount: holdings.length,
    transactionsCount: transactions.length,
    allocation,
    topHoldings,
  };
}

export async function addTransaction(userId: string, input: TransactionInput): Promise<Transaction | null> {
  try {
    const transactionRef = doc(collection(db, 'portfolioTransactions'));
    const holdings = collection(db, 'portfolioHoldings');
    const symbol = input.symbol.trim();
    const now = new Date().toISOString();

    // Queries are not allowed inside client transactions — resolve the holding
    // document ref first, then lock/update it atomically with the ledger write.
    let holdingRef = input.holdingId ? doc(db, 'portfolioHoldings', input.holdingId) : null;
    if (!holdingRef && (input.type === 'buy' || input.type === 'sell')) {
      const holdingsSnap = await getDocs(
        query(holdings, where('userId', '==', userId), where('symbol', '==', symbol)),
      );
      if (!holdingsSnap.empty) {
        holdingRef = holdingsSnap.docs[0].ref;
      } else if (input.type === 'buy') {
        holdingRef = doc(db, 'portfolioHoldings', `${userId}_${symbol.toUpperCase()}`);
      } else {
        throw new Error(`Cannot sell ${input.quantity} shares: no holding exists for ${symbol}`);
      }
    }

    const transaction = await runTransaction(db, async (tx) => {
      let resolvedHoldingId = holdingRef?.id || input.holdingId || '';

      if ((input.type === 'buy' || input.type === 'sell') && holdingRef) {
        const holdingSnap = await tx.get(holdingRef);
        const existing = holdingSnap.data();

        if (!existing) {
          if (input.type === 'sell') {
            throw new Error(`Cannot sell ${input.quantity} shares: no holding exists for ${symbol}`);
          }
          const quantity = input.quantity;
          const avgCost =
            quantity > 0 ? (input.quantity * input.price + input.fees) / quantity : input.price;
          tx.set(holdingRef, {
            userId,
            symbol,
            name: symbol,
            assetClass: input.assetClass || inferAssetClass(symbol),
            quantity,
            avgCost,
            currentPrice: input.price,
            currency: 'USD',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const currentQty = existing.quantity || 0;
          if (input.type === 'sell' && input.quantity > currentQty) {
            throw new Error(
              `Cannot sell ${input.quantity} shares: only ${currentQty} are held for ${symbol}`,
            );
          }

          const quantity =
            input.type === 'buy' ? currentQty + input.quantity : currentQty - input.quantity;
          const avgCost =
            input.type === 'buy' && quantity > 0
              ? (currentQty * (existing.avgCost || 0) +
                  input.quantity * input.price +
                  input.fees) /
                quantity
              : existing.avgCost || 0;

          tx.update(holdingRef, {
            quantity,
            avgCost,
            currentPrice: input.price,
            updatedAt: serverTimestamp(),
          });
        }

        resolvedHoldingId = holdingRef.id;
      }

      const ledgerTransaction: Omit<Transaction, 'id'> = {
        userId,
        holdingId: resolvedHoldingId,
        symbol,
        type: input.type,
        quantity: input.quantity,
        price: input.price,
        fees: input.fees,
        notes: input.notes?.trim() || '',
        date: input.date,
        createdAt: now,
      };
      tx.set(transactionRef, { ...ledgerTransaction, createdAt: serverTimestamp() });
      return { ...ledgerTransaction, id: transactionRef.id };
    });

    return transaction;
  } catch (error) {
    console.error('Error adding transaction:', error);
    handleFirestoreError(error, OperationType.CREATE, 'portfolioTransactions');
    return null;
  }
}

export async function addHolding(userId: string, input: HoldingInput): Promise<Holding | null> {
  try {
    const id = doc(collection(db, 'portfolioHoldings')).id;
    const now = new Date().toISOString();
    const holding: Omit<Holding, 'id'> = {
      userId,
      symbol: input.symbol.trim().toUpperCase(),
      name: input.name.trim() || input.symbol.trim().toUpperCase(),
      assetClass: input.assetClass,
      quantity: input.quantity,
      avgCost: input.avgCost,
      currentPrice: input.currentPrice,
      currency: input.currency || 'USD',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'portfolioHoldings', id), {
      ...holding,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...holding, id };
  } catch (error) {
    console.error('Error adding holding:', error);
    handleFirestoreError(error, OperationType.CREATE, 'portfolioHoldings');
    return null;
  }
}

export async function removeHolding(userId: string, holdingId: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'portfolioHoldings', holdingId), {
      deleted: true,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error removing holding:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'portfolioHoldings');
    return false;
  }
}

function mapHoldingData(id: string, data: Record<string, unknown>, fallbackUserId = ''): Holding {
  return {
    id,
    userId: (data.userId as string) || fallbackUserId,
    symbol: (data.symbol as string) || '',
    name: (data.name as string) || '',
    assetClass: (data.assetClass as AssetClass) || 'equities',
    quantity: (data.quantity as number) || 0,
    avgCost: (data.avgCost as number) || 0,
    currentPrice: (data.currentPrice as number) || 0,
    currency: (data.currency as string) || 'USD',
    // Holdings store createdAt/updatedAt as Firestore serverTimestamp(). Normalize
    // via toDate() so both Timestamp and legacy ISO-string values parse to a
    // consistent ISO string. (Issue #1031)
    createdAt: toDate(data.createdAt)?.toISOString() || '',
    updatedAt: toDate(data.updatedAt)?.toISOString() || '',
  };
}

/** Prefer collection holdings; keep embedded ones that are not already present. */
export function mergeCollectionAndEmbeddedHoldings(
  collectionHoldings: Holding[],
  embeddedHoldings: Holding[],
): Holding[] {
  const byId = new Map<string, Holding>();
  const symbols = new Set<string>();

  for (const h of collectionHoldings) {
    byId.set(h.id, h);
    if (h.symbol) symbols.add(h.symbol.toUpperCase());
  }

  for (const h of embeddedHoldings) {
    if (!h.id || byId.has(h.id)) continue;
    const symbolKey = (h.symbol || '').toUpperCase();
    if (symbolKey && symbols.has(symbolKey)) continue;
    byId.set(h.id, h);
    if (symbolKey) symbols.add(symbolKey);
  }

  return Array.from(byId.values());
}

export async function fetchUserHoldings(userId: string): Promise<Holding[]> {
  try {
    const holdingsRef = collection(db, 'portfolioHoldings');
    const q = query(
      holdingsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const holdings: Holding[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.deleted) return;
      holdings.push(mapHoldingData(docSnap.id, data, userId));
    });
    return holdings;
  } catch (error) {
    console.error('Error fetching holdings:', error);
    handleFirestoreError(error, OperationType.LIST, 'portfolioHoldings');
    return [];
  }
}

/**
 * Copy legacy portfolio.holdings[] into portfolioHoldings, then clear the
 * embedded arrays so add/fetch/delete share one persistence model.
 */
export async function migrateEmbeddedHoldings(userId: string): Promise<number> {
  try {
    const portfolios = await fetchUserPortfolios(userId);
    const existing = await fetchUserHoldings(userId);
    const existingIds = new Set(existing.map((h) => h.id));
    const existingSymbols = new Set(existing.map((h) => h.symbol.toUpperCase()));
    let migrated = 0;

    for (const portfolio of portfolios) {
      const embedded = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
      if (embedded.length === 0) continue;

      for (const raw of embedded) {
        const holding = mapHoldingData(
          raw.id || doc(collection(db, 'portfolioHoldings')).id,
          raw as unknown as Record<string, unknown>,
          userId,
        );
        if (existingIds.has(holding.id)) continue;
        if (holding.symbol && existingSymbols.has(holding.symbol.toUpperCase())) continue;

        await setDoc(doc(db, 'portfolioHoldings', holding.id), {
          ...holding,
          userId,
          createdAt: holding.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingIds.add(holding.id);
        if (holding.symbol) existingSymbols.add(holding.symbol.toUpperCase());
        migrated += 1;
      }

      await updateDoc(doc(db, 'portfolios', portfolio.id), {
        holdings: [],
        updatedAt: serverTimestamp(),
      });
    }

    return migrated;
  } catch (error) {
    console.error('Error migrating embedded holdings:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'portfolios');
    return 0;
  }
}

export async function fetchUserTransactions(userId: string): Promise<Transaction[]> {
  try {
    const transactionsRef = collection(db, 'portfolioTransactions');
    const q = query(
      transactionsRef,
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    const transactions: Transaction[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      transactions.push({
        id: docSnap.id,
        userId: data.userId || '',
        holdingId: data.holdingId || '',
        symbol: data.symbol || '',
        type: data.type || 'buy',
        quantity: data.quantity || 0,
        price: data.price || 0,
        fees: data.fees || 0,
        notes: data.notes || '',
        date: data.date || '',
        createdAt: data.createdAt || '',
      });
    });
    return transactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    handleFirestoreError(error, OperationType.LIST, 'portfolioTransactions');
    return [];
  }
}

export async function createPortfolio(userId: string, name: string, description?: string): Promise<Portfolio | null> {
  try {
    const id = doc(collection(db, 'portfolios')).id;
    const portfolio: Omit<Portfolio, 'id'> = {
      userId,
      name: name.trim(),
      description: description?.trim() || '',
      holdings: [],
      transactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'portfolios', id), {
      ...portfolio,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...portfolio, id };
  } catch (error) {
    console.error('Error creating portfolio:', error);
    handleFirestoreError(error, OperationType.CREATE, 'portfolios');
    return null;
  }
}

export async function fetchUserPortfolios(userId: string): Promise<Portfolio[]> {
  try {
    const portfoliosRef = collection(db, 'portfolios');
    const q = query(
      portfoliosRef,
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const portfolios: Portfolio[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      portfolios.push({
        id: docSnap.id,
        userId: data.userId || '',
        name: data.name || '',
        description: data.description || '',
        holdings: data.holdings || [],
        transactions: data.transactions || [],
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
      });
    });
    return portfolios;
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    handleFirestoreError(error, OperationType.LIST, 'portfolios');
    return [];
  }
}

export async function updatePortfolio(userId: string, portfolioId: string, updates: Partial<Portfolio>): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'portfolios', portfolioId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating portfolio:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'portfolios');
    return false;
  }
}

export async function deletePortfolio(userId: string, portfolioId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'portfolios', portfolioId));
    return true;
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    handleFirestoreError(error, OperationType.DELETE, 'portfolios');
    return false;
  }
}

export interface PortfolioSnapshot {
  id?: string;
  userId: string;
  portfolioId: string;
  totalValue: number;
  totalCost: number;
  profitLoss: number;
  profitLossPercent: number;
  snapshotDate: string;
  createdAt: string;
}

export async function savePortfolioSnapshot(
  userId: string,
  portfolioId: string,
  holdings: Holding[],
): Promise<boolean> {
  try {
    const totalValue = calculateTotalValue(holdings);
    const totalCost = holdings.reduce((sum, h) => sum + h.avgCost * h.quantity, 0);
    const profitLoss = totalValue - totalCost;
    const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

    await addDoc(collection(db, 'portfolioSnapshots'), {
      userId,
      portfolioId,
      totalValue,
      totalCost,
      profitLoss,
      profitLossPercent,
      snapshotDate: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);
    handleFirestoreError(error, OperationType.CREATE, 'portfolioSnapshots');
    return false;
  }
}

export async function fetchPortfolioHistory(
  userId: string,
  portfolioId: string,
  limitCount = 30,
): Promise<PortfolioSnapshot[]> {
  try {
    const snapshotsRef = collection(db, 'portfolioSnapshots');
    const q = query(
      snapshotsRef,
      where('userId', '==', userId),
      where('portfolioId', '==', portfolioId),
      orderBy('snapshotDate', 'desc'),
      limit(limitCount),
    );
    const snapshot = await getDocs(q);
    const snapshots: PortfolioSnapshot[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      snapshots.push({
        id: docSnap.id,
        userId: data.userId || '',
        portfolioId: data.portfolioId || '',
        totalValue: data.totalValue || 0,
        totalCost: data.totalCost || 0,
        profitLoss: data.profitLoss || 0,
        profitLossPercent: data.profitLossPercent || 0,
        snapshotDate: data.snapshotDate || '',
        createdAt: data.createdAt || '',
      });
    });
    return snapshots;
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    handleFirestoreError(error, OperationType.LIST, 'portfolioSnapshots');
    return [];
  }
}
