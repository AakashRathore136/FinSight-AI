/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from 'react';
import {
  format,
} from 'date-fns';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  PieChart as PieChartIcon,
  BarChart3,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Select } from '@/src/components/ui/select';
import { cn, formatCurrency } from '@/src/lib/utils';
import { formatCurrencyDisplay, fetchExchangeRates, convertAmount } from '@/src/lib/currencyUtils';
import { useBaseCurrency } from '@/src/hooks/useBaseCurrency';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  type Holding,
  type Transaction,
  type PortfolioSnapshot,
  calculateTotalValue,
  calculateProfitLoss,
  calculateAllocation,
  fetchUserHoldings,
  fetchUserTransactions,
  createPortfolio,
  addTransaction,
  removeHolding,
  getAssetClassColor,
  savePortfolioSnapshot,
  fetchPortfolioHistory,
  addHolding,
  migrateEmbeddedHoldings,
} from '@/src/lib/portfolioUtils';

interface PortfolioTrackerProps {
  user: import('firebase/auth').User | null;
}

export function PortfolioTracker({ user }: PortfolioTrackerProps) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('holdings');
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<PortfolioSnapshot[]>([]);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  const baseCurrency = useBaseCurrency(user);
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExchangeRates(baseCurrency)
      .then((res) => {
        if (!cancelled) setRates(res.rates);
      })
      .catch(() => {
        /* keep rates null → totals fall back to local-currency values */
      });
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState<Holding['assetClass']>('equities');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [currency, setCurrency] = useState('USD');

  const [holdingId, setHoldingId] = useState('');
  const [txType, setTxType] = useState<Transaction['type']>('buy');
  const [txQuantity, setTxQuantity] = useState('');
  const [txPrice, setTxPrice] = useState('');
  const [txFees, setTxFees] = useState('');
  const [txNotes, setTxNotes] = useState('');

  useEffect(() => {
    if (!user) {
      setPortfolioId(null);
      setHoldings([]);
      setTransactions([]);
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        await migrateEmbeddedHoldings(user.uid);
        if (!active) return;
        const [portfolios, h, t] = await Promise.all([
          (await import('@/src/lib/portfolioUtils')).fetchUserPortfolios(user.uid),
          fetchUserHoldings(user.uid),
          fetchUserTransactions(user.uid),
        ]);
        if (active) {
          if (portfolios.length > 0) {
            setPortfolioId(portfolios[0].id);
            setHoldings(h);
            setTransactions(t);
          } else {
            const newPortfolio = await createPortfolio(user.uid, 'My Portfolio');
            if (newPortfolio && active) {
              setPortfolioId(newPortfolio.id);
              setHoldings([]);
              setTransactions([]);
            }
          }
        }
      } catch (error) {
        console.error('Error loading portfolio:', error);
        handleFirestoreError(error, OperationType.LIST, 'portfolios');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !portfolioId || activeTab !== 'performance') return;
    let active = true;
    const loadHistory = async () => {
      if (transactions.length === 0 && holdings.length === 0) {
        if (active) setPerformanceHistory([]);
        return;
      }
      const history = await fetchPortfolioHistory(user.uid, portfolioId);
      if (active) setPerformanceHistory(history);
    };
    loadHistory();
    return () => { active = false; };
  }, [user, portfolioId, activeTab, transactions, holdings]);

  const totalValue = useMemo(
    () => calculateTotalValue(holdings, rates ?? undefined, baseCurrency),
    [holdings, rates, baseCurrency],
  );
  const totalCost = useMemo(
    () =>
      holdings.reduce((s, h) => {
        const local = h.quantity * h.avgCost;
        if (!rates || h.currency === baseCurrency) return s + local;
        const converted = h.currency
          ? convertAmount(local, h.currency, baseCurrency, rates)
          : null;
        return s + (converted == null ? local : converted);
      }, 0),
    [holdings, rates, baseCurrency],
  );
  const profitLoss = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        const local = (h.currentPrice - h.avgCost) * h.quantity;
        if (!rates || !h.currency || h.currency === baseCurrency)
          return sum + local;
        const converted = convertAmount(local, h.currency, baseCurrency, rates);
        return sum + (converted == null ? local : converted);
      }, 0),
    [holdings, rates, baseCurrency],
  );
  const allocation = useMemo(
    () => calculateAllocation(holdings, rates ?? undefined, baseCurrency),
    [holdings, rates, baseCurrency],
  );

  const handleAddHolding = async () => {
    if (!user) return;
    const q = parseFloat(quantity);
    const cost = parseFloat(avgCost);
    const price = parseFloat(currentPrice);
    if (!symbol || Number.isNaN(q) || q <= 0 || isNaN(cost) || isNaN(price)) {
      toast.error('Please fill all fields correctly');
      return;
    }
    try {
      const holding = await addHolding(user.uid, {
        symbol,
        name: name || symbol,
        assetClass,
        quantity: q,
        avgCost: cost,
        currentPrice: price,
        currency: currency || 'USD',
        portfolioId: portfolioId || undefined,
      });
      if (holding) {
        setHoldings((prev) => [holding, ...prev]);
        setSymbol('');
        setName('');
        setQuantity('');
        setAvgCost('');
        setCurrentPrice('');
        setAddHoldingOpen(false);
        toast.success('Holding added');
      }
    } catch (error) {
      console.error('Error adding holding:', error);
      toast.error('Failed to add holding');
    }
  };

  const handleAddTransaction = async () => {
    if (!user || !portfolioId || !holdingId) return;
    const q = parseFloat(txQuantity);
    const price = parseFloat(txPrice);
    const fees = parseFloat(txFees) || 0;
    if (isNaN(q) || q <= 0 || isNaN(price) || price <= 0) {
      toast.error('Please fill transaction fields correctly');
      return;
    }
    try {
      const result = await addTransaction(user.uid, {
        holdingId,
        symbol: holdings.find((h) => h.id === holdingId)?.symbol || '',
        portfolioId,
        assetClass: holdings.find((h) => h.id === holdingId)?.assetClass,
        type: txType,
        quantity: q,
        price,
        fees,
        notes: txNotes || '',
        date: new Date().toISOString(),
      });
      if (result) {
        const [h, t] = await Promise.all([
          fetchUserHoldings(user.uid),
          fetchUserTransactions(user.uid),
        ]);
        setHoldings(h);
        setTransactions(t);
        setHoldingId('');
        setTxQuantity('');
        setTxPrice('');
        setTxFees('');
        setTxNotes('');
        setAddTransactionOpen(false);
        toast.success('Transaction recorded');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'portfolioTransactions');
      toast.error(
        error instanceof Error ? error.message : 'Failed to add transaction',
      );
    }
  };

  const handleDeleteHolding = async (id: string) => {
    if (!user) return;
    try {
      const ok = await removeHolding(user.uid, id);
      if (ok) {
        const h = await fetchUserHoldings(user.uid);
        setHoldings(h);
        toast.success('Holding removed');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'portfolioHoldings');
      toast.error('Failed to remove holding');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const pieData = allocation.map((a) => ({
    name: a.assetClass.replace('_', ' '),
    value: a.value,
    percentage: a.percentage,
  }));

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
            <Briefcase className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Investment Portfolio</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Track holdings, performance, and asset allocation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={addTransactionOpen} onOpenChange={setAddTransactionOpen}>
            <DialogTrigger>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl h-9 px-4 text-xs font-semibold uppercase tracking-wider"
              >
                <History className="mr-2 h-3.5 w-3.5" />
                Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Holding</label>
                  <Select
                    value={holdingId}
                    onChange={(e) => setHoldingId(e.target.value)}
                    options={holdings.map((h) => ({ value: h.id, label: `${h.symbol} - ${h.name}` }))}
                    placeholder="Select holding"
                    className="mt-1 bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Type</label>
                  <Select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as Transaction['type'])}
                    options={[
                      { value: 'buy', label: 'Buy' },
                      { value: 'sell', label: 'Sell' },
                      { value: 'dividend', label: 'Dividend' },
                      { value: 'deposit', label: 'Deposit' },
                      { value: 'withdrawal', label: 'Withdrawal' },
                    ]}
                    className="mt-1 bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Quantity</label>
                    <Input type="number" value={txQuantity} onChange={(e) => setTxQuantity(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Price</label>
                    <Input type="number" value={txPrice} onChange={(e) => setTxPrice(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Fees</label>
                  <Input type="number" value={txFees} onChange={(e) => setTxFees(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Notes</label>
                  <Input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                </div>
                <Button onClick={handleAddTransaction} className="w-full bg-violet-600 hover:bg-violet-700">Save Transaction</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addHoldingOpen} onOpenChange={setAddHoldingOpen}>
            <DialogTrigger>
              <Button className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm rounded-xl h-9 px-4">
                <Plus className="mr-2 h-4 w-4" />
                Add Holding
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>Add Holding</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Symbol</label>
                  <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="AAPL" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="Apple Inc." />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Asset Class</label>
                  <Select
                    value={assetClass}
                    onChange={(e) => setAssetClass(e.target.value as Holding['assetClass'])}
                    options={[
                      { value: 'equities', label: 'Equities' },
                      { value: 'fixed_income', label: 'Fixed Income' },
                      { value: 'real_estate', label: 'Real Estate' },
                      { value: 'commodities', label: 'Commodities' },
                      { value: 'crypto', label: 'Crypto' },
                      { value: 'cash', label: 'Cash' },
                    ]}
                    className="mt-1 bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Quantity</label>
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Avg Cost</label>
                    <Input type="number" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Price</label>
                    <Input type="number" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Currency</label>
                    <Select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      options={[
                        { value: 'USD', label: 'USD' },
                        { value: 'EUR', label: 'EUR' },
                        { value: 'GBP', label: 'GBP' },
                        { value: 'INR', label: 'INR' },
                      ]}
                      className="mt-1 bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
                <Button onClick={handleAddHolding} className="w-full bg-violet-600 hover:bg-violet-700">Save Holding</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Total Value" value={formatCurrency(totalValue)} sub={`${holdings.length} holdings`} accent="indigo" />
        <SummaryCard icon={<BarChart3 className="h-4 w-4" />} label="Total Cost" value={formatCurrency(totalCost)} sub="Average cost basis" accent="slate" />
        <SummaryCard icon={profitLoss >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} label="Profit / Loss" value={formatCurrency(Math.abs(profitLoss))} sub={profitLoss >= 0 ? 'In profit' : 'In loss'} accent={profitLoss >= 0 ? 'emerald' : 'red'} />
        <SummaryCard icon={<PieChartIcon className="h-4 w-4" />} label="Asset Classes" value={`${allocation.length}`} sub="Diversified" accent="violet" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1">
          <TabsTrigger value="holdings" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">Holdings</TabsTrigger>
          <TabsTrigger value="allocation" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">Allocation</TabsTrigger>
          <TabsTrigger value="transactions" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">Transactions</TabsTrigger>
          <TabsTrigger value="performance" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="mt-6 space-y-4">
          <AnimatePresence>
            {holdings.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900 rounded-2xl">
                <CardContent className="py-16 text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                    <Briefcase className="h-8 w-8 text-slate-500" />
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-1">No holdings yet</h3>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto">Add your first investment holding to start tracking your portfolio.</p>
                </CardContent>
              </Card>
            ) : (
              holdings.map((h) => {
                const value = h.quantity * h.currentPrice;
                const cost = h.quantity * h.avgCost;
                const pl = value - cost;
                const plPercent = cost > 0 ? (pl / cost) * 100 : 0;
                return (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                      <CardContent className="p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-white font-semibold text-sm truncate">{h.symbol}</h3>
                              <span className="text-slate-400 text-xs">{h.name}</span>
                              <Badge className="text-[10px] uppercase tracking-wider bg-white/5 text-white border-white/10">
                                {h.assetClass.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                              <span>Qty: <span className="text-slate-300">{h.quantity}</span></span>
                              <span>Avg: <span className="text-slate-300">{formatCurrency(h.avgCost)}</span></span>
                              <span>Price: <span className="text-slate-300">{formatCurrency(h.currentPrice)}</span></span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right min-w-[100px]">
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Value</p>
                              <p className="text-sm font-bold text-white tabular-nums">{formatCurrency(value)}</p>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">P/L</p>
                              <p className={cn('text-sm font-bold tabular-nums', pl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                {formatCurrency(Math.abs(pl))}
                              </p>
                              <p className={cn('text-[10px]', pl >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                {plPercent.toFixed(1)}%
                              </p>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteHolding(h.id)} className="text-slate-500 hover:text-red-400 h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="allocation" className="mt-6">
          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-violet-400" />
                Asset Allocation
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">Distribution by asset class</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                       label={({ name, percent }) => `${name}: ${((percent as number) * 100).toFixed(1)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={getAssetClassColor(entry.name.replace(' ', '_') as any)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      labelStyle={{ color: '#f8fafc' }}
                      formatter={(value: number) => [formatCurrency(value), 'Value']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-400" />
                Transaction History
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">Recent portfolio transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                    <History className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">No transactions yet</p>
                  <p className="text-slate-500 text-xs mt-1">Record a transaction to see it here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.slice(0, 20).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="flex items-center gap-4">
                        <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', tx.type === 'buy' || tx.type === 'deposit' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400')}>
                          {tx.type === 'buy' || tx.type === 'deposit' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{tx.symbol} - {tx.type.toUpperCase()}</p>
                          <p className="text-xs text-slate-500">{format(new Date(tx.date), 'MMM dd, yyyy')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white tabular-nums">{tx.quantity} @ {formatCurrency(tx.price)}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{tx.fees > 0 ? `Fees: ${formatCurrency(tx.fees)}` : 'No fees'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Portfolio Performance</h3>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
              onClick={async () => {
                if (!user || !portfolioId) return;
                setIsSavingSnapshot(true);
                await savePortfolioSnapshot(user.uid, portfolioId, holdings);
                const history = await fetchPortfolioHistory(user.uid, portfolioId);
                setPerformanceHistory(history);
                setIsSavingSnapshot(false);
                toast.success('Portfolio snapshot saved');
              }}
              disabled={isSavingSnapshot}
            >
              {isSavingSnapshot ? 'Saving...' : 'Save Snapshot'}
            </Button>
          </div>

          <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
            <CardContent className="p-5">
              <h4 className="text-sm font-medium text-slate-400 mb-4">Portfolio Value Over Time</h4>
              {performanceHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={[...performanceHistory].reverse()}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="snapshotDate"
                      tickFormatter={(v: string) => {
                        try { return format(new Date(v), 'MMM d'); } catch { return v; }
                      }}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      stroke="#1e293b"
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      stroke="#1e293b"
                    />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#e2e8f0' }}
                      formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Total Value']}
                      labelFormatter={(label: string) => {
                        try { return format(new Date(label), 'MMM d, yyyy'); } catch { return label; }
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalValue"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#0ea5e9' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-slate-500 text-sm">
                  No performance history yet. Save a snapshot to start tracking.
                </div>
              )}
            </CardContent>
          </Card>

          {performanceHistory.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                  <CardContent className="p-5">
                    <p className="text-xs text-slate-500 mb-1">All-Time Return</p>
                    <p className={cn(
                      'text-2xl font-bold tabular-nums',
                      (performanceHistory[0]?.profitLoss ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {formatCurrencyDisplay((performanceHistory[0]?.profitLoss ?? 0), 'USD')}
                    </p>
                    <p className={cn(
                      'text-xs mt-1',
                      (performanceHistory[0]?.profitLossPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {((performanceHistory[0]?.profitLossPercent ?? 0) >= 0 ? '+' : '')}
                      {(performanceHistory[0]?.profitLossPercent ?? 0).toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
                  <CardContent className="p-5">
                    <p className="text-xs text-slate-500 mb-1">Latest Total Value</p>
                    <p className="text-2xl font-bold text-white tabular-nums">
                      {formatCurrencyDisplay(performanceHistory[0]?.totalValue ?? 0, 'USD')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {performanceHistory.length} snapshots
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: 'emerald' | 'red' | 'amber' | 'indigo' | 'slate' | 'violet';
}) {
  const accentMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
    slate: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  }[accent];

  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', accentMap)}>
            {icon}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        </div>
        <p className="text-2xl font-bold text-white mt-3 tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
