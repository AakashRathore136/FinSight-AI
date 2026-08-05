import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Globe,
  RefreshCw,
  TrendingUp,
  Filter,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ArrowRightLeft,
  History,
  DollarSign,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { toDate } from '@/src/lib/utils';
import {
  MAJOR_CURRENCIES,
  fetchExchangeRates,
  convertAmount,
  aggregateMultiCurrencyTotals,
  formatCurrencyDisplay,
  getCurrencySymbol,
  type CurrencySettings,
  type ExchangeRates,
} from '@/src/lib/currencyUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Skeleton } from '@/src/components/ui/skeleton';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';

interface Transaction {
  id: string;
  userId: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  date: any;
  createdAt: any;
}

interface CurrencyManagerProps {
  user: any;
}

export function CurrencyManager({ user }: CurrencyManagerProps) {
  const [settings, setSettings] = useState<CurrencySettings | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'history'>('overview');
  const [filterCurrency, setFilterCurrency] = useState<string>('all');

  const [newTx, setNewTx] = useState({
    description: '',
    amount: '',
    currency: 'USD',
    category: 'General',
    type: 'expense' as 'income' | 'expense',
    date: new Date().toISOString().split('T')[0],
  });
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    currency: 'USD',
    category: 'General',
    type: 'expense' as 'income' | 'expense',
    date: '',
  });

  useEffect(() => {
    if (!user) return;
    loadSettings();
    loadTransactions();
    loadRates();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const txQuery = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => {
        setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'transactions')
    );
    return () => unsubscribe();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const settingsDoc = await getDoc(doc(db, 'currencies', user.uid));
      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as CurrencySettings);
      } else {
        const defaultSettings: CurrencySettings = {
          userId: user.uid,
          baseCurrency: 'USD',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'],
          lastRateUpdate: new Date().toISOString(),
          conversionHistory: {},
        };
        await setDoc(doc(db, 'currencies', user.uid), defaultSettings);
        setSettings(defaultSettings);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'currencies');
    }
  };

  const loadTransactions = async () => {
    if (!user) return;
    try {
      const txQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(txQuery);
      setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    } finally {
      setLoading(false);
    }
  };

  const loadRates = async () => {
    setRefreshing(true);
    try {
      const data = await fetchExchangeRates(settings?.baseCurrency || 'USD');
      setRates(data);
      if (settings) {
        const historyEntry: Record<string, number> = { ...data.rates };
        const updatedHistory = {
          ...settings.conversionHistory,
          [data.date]: historyEntry,
        };
        const updatedSettings = {
          ...settings,
          lastRateUpdate: new Date().toISOString(),
          conversionHistory: updatedHistory,
        };
        await setDoc(doc(db, 'currencies', user.uid), updatedSettings);
        setSettings(updatedSettings);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'exchangeRates');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddTransaction = async () => {
    if (!user || !newTx.description || !newTx.amount || parseFloat(newTx.amount) <= 0) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        description: newTx.description,
        amount: parseFloat(newTx.amount),
        currency: newTx.currency,
        category: newTx.category,
        date: new Date(newTx.date),
        createdAt: serverTimestamp(),
      });
      toast.success('Transaction added');
      setNewTx({
        description: '',
        amount: '',
        currency: settings?.baseCurrency || 'USD',
        category: 'General',
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
      toast.error('Failed to add transaction');
    }
  };

  const handleUpdateTransaction = async (txId: string) => {
    if (!editForm.description || !editForm.amount || parseFloat(editForm.amount) <= 0) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      await updateDoc(doc(db, 'transactions', txId), {
        description: editForm.description,
        amount: parseFloat(editForm.amount),
        currency: editForm.currency,
        category: editForm.category,
        date: new Date(editForm.date),
      });
      toast.success('Transaction updated');
      setEditingTx(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${txId}`);
      toast.error('Failed to update transaction');
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', txId));
      toast.success('Transaction deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${txId}`);
      toast.error('Failed to delete transaction');
    }
  };

  const updateSettings = async (updates: Partial<CurrencySettings>) => {
    if (!user || !settings) return;
    try {
      const newSettings = { ...settings, ...updates };
      await setDoc(doc(db, 'currencies', user.uid), newSettings);
      setSettings(newSettings);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'currencies');
    }
  };

  const filteredTransactions = filterCurrency === 'all'
    ? transactions
    : transactions.filter((tx) => tx.currency === filterCurrency);

  const aggregated = settings && rates
    ? aggregateMultiCurrencyTotals(filteredTransactions, settings.baseCurrency, rates.rates)
    : { totalBase: 0, byCurrency: {} };

  const historyDates = settings?.conversionHistory
    ? Object.keys(settings.conversionHistory).sort((a, b) => a - b).reverse().slice(0, 10)
    : [];

  const categories = ['General', 'Food', 'Transport', 'Utilities', 'Entertainment', 'Healthcare', 'Travel', 'Income'];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 bg-slate-800" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 bg-slate-800" />
          <Skeleton className="h-48 bg-slate-800" />
        </div>
        <Skeleton className="h-96 bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Globe size={24} />
            </div>
            Multi-Currency Hub
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Manage currencies, track expenses, and convert amounts across global markets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadRates}
            disabled={refreshing}
            className="h-10 border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <RefreshCw className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} size={14} />
            Refresh Rates
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        {[
          { key: 'overview', label: 'Overview', icon: TrendingUp },
          { key: 'transactions', label: 'Transactions', icon: DollarSign },
          { key: 'history', label: 'Conversion History', icon: History },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveView(key as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors border-b-2 ${
              activeView === key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-6 md:grid-cols-2"
        >
          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800">
              <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Globe size={18} />
                </div>
                Base Currency
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Select Base Currency
                </label>
                <Select
                  value={settings?.baseCurrency || 'USD'}
                  onValueChange={(val) => updateSettings({ baseCurrency: val })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                    {MAJOR_CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code} className="cursor-pointer">
                        <span className="flex items-center gap-2">
                          <span>{currency.flag}</span>
                          <span>{currency.code}</span>
                          <span className="text-slate-500 text-xs">- {currency.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Supported Currencies
                </label>
                <div className="flex flex-wrap gap-2">
                  {MAJOR_CURRENCIES.map((currency) => {
                    const isSupported = settings?.supportedCurrencies.includes(currency.code);
                    return (
                      <button
                        key={currency.code}
                        onClick={() => {
                          const current = settings?.supportedCurrencies || [];
                          const updated = isSupported
                            ? current.filter((c) => c !== currency.code)
                            : [...current, currency.code];
                          updateSettings({ supportedCurrencies: updated });
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          isSupported
                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span>{currency.flag}</span>
                        <span>{currency.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800">
              <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <TrendingUp size={18} />
                </div>
                Portfolio Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                  Total in {settings?.baseCurrency || 'USD'}
                </p>
                <p className="text-3xl font-black text-white tabular-nums">
                  {formatCurrencyDisplay(aggregated.totalBase, settings?.baseCurrency || 'USD')}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {filteredTransactions.length} transactions
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  By Currency
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(aggregated.byCurrency).map(([currency, total]) => (
                    <div
                      key={currency}
                      className="flex items-center justify-between rounded-lg bg-slate-800/30 border border-slate-700/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] font-bold">
                          {currency}
                        </Badge>
                      </div>
                      <span className="text-sm font-bold text-white tabular-nums">
                        {formatCurrencyDisplay(total, currency)}
                      </span>
                    </div>
                  ))}
                  {Object.keys(aggregated.byCurrency).length === 0 && (
                    <p className="text-xs text-slate-600 italic py-2">No transactions yet</p>
                  )}
                </div>
              </div>

              {rates && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Live Rates (from {rates.base})
                  </p>
                  <ScrollArea className="h-32">
                    <div className="space-y-1">
                      {Object.entries(rates.rates)
                        .filter(([code]) => (settings?.supportedCurrencies || []).includes(code))
                        .slice(0, 10)
                        .map(([code, rate]) => (
                          <div
                            key={code}
                            className="flex items-center justify-between text-xs py-1"
                          >
                            <span className="text-slate-400 font-medium">{code}</span>
                            <span className="text-slate-300 tabular-nums">{rate.toFixed(4)}</span>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeView === 'transactions' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800">
              <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Plus size={18} />
                </div>
                Add Transaction
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
                <Input
                  placeholder="Description"
                  value={newTx.description}
                  onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10"
                />
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newTx.amount}
                  onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 tabular-nums"
                  min="0"
                  step="0.01"
                />
                <Select
                  value={newTx.type}
                  onValueChange={(val) => setNewTx({ ...newTx, type: val as 'income' | 'expense' })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                    <SelectItem value="expense" className="cursor-pointer">Expense</SelectItem>
                    <SelectItem value="income" className="cursor-pointer">Income</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={newTx.currency}
                  onValueChange={(val) => setNewTx({ ...newTx, currency: val })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                    {(settings?.supportedCurrencies || ['USD']).map((code) => {
                      const currency = MAJOR_CURRENCIES.find((c) => c.code === code);
                      return (
                        <SelectItem key={code} value={code} className="cursor-pointer">
                          {currency?.flag} {code}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={newTx.date}
                  onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white h-10"
                />
                <Button
                  onClick={handleAddTransaction}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-4"
                >
                  <Plus size={16} className="mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-500" />
            <Select value={filterCurrency} onValueChange={setFilterCurrency}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9 w-48">
                <SelectValue placeholder="Filter by currency" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                <SelectItem value="all" className="cursor-pointer">All Currencies</SelectItem>
                {(settings?.supportedCurrencies || []).map((code) => (
                  <SelectItem key={code} value={code} className="cursor-pointer">
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="bg-slate-800 text-slate-400 border-slate-700">
              {filteredTransactions.length} transactions
            </Badge>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-2">
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <DollarSign size={32} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">No transactions found</p>
                    <p className="text-xs mt-1">Add your first transaction above</p>
                  </div>
                ) : (
                  filteredTransactions.map((tx) => (
                    <motion.div
                      key={tx.id}
                      layout
                      className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4 hover:bg-slate-800/30 transition-colors"
                    >
                      {editingTx === tx.id ? (
                        <>
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white h-8 text-xs flex-1"
                          />
                          <Input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white h-8 text-xs w-24 tabular-nums"
                          />
                          <Select
                            value={editForm.currency}
                            onValueChange={(val) => setEditForm({ ...editForm, currency: val })}
                          >
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                              {(settings?.supportedCurrencies || ['USD']).map((code) => (
                                <SelectItem key={code} value={code} className="cursor-pointer text-xs">
                                  {code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={editForm.type}
                            onValueChange={(val) => setEditForm({ ...editForm, type: val as 'income' | 'expense' })}
                          >
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                              <SelectItem value="expense" className="cursor-pointer text-xs">Expense</SelectItem>
                              <SelectItem value="income" className="cursor-pointer text-xs">Income</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white h-8 text-xs w-36"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleUpdateTransaction(tx.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2"
                          >
                            <Save size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTx(null)}
                            className="text-slate-500 hover:text-white h-8 px-2"
                          >
                            <X size={14} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{tx.description}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{tx.category}</p>
                          </div>
                          <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] font-bold">
                            {tx.currency}
                          </Badge>
                          <div className="text-right min-w-[100px]">
                            <p className="text-sm font-black text-white tabular-nums">
                              {formatCurrencyDisplay(tx.amount, tx.currency)}
                            </p>
                            {settings && rates && tx.currency !== settings.baseCurrency && (
                              <p className="text-[10px] text-slate-500">
                                = {formatCurrencyDisplay(convertAmount(tx.amount, tx.currency, settings.baseCurrency, rates.rates), settings.baseCurrency)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingTx(tx.id);
                                setEditForm({
                                  description: tx.description,
                                  amount: tx.amount.toString(),
                                  currency: tx.currency,
                                  category: tx.category,
                                  date: toDate(tx.date)
                                    ? toDate(tx.date)!.toISOString().split('T')[0]
                                    : '',
                                });
                              }}
                              className="p-2 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </motion.div>
      )}

      {activeView === 'history' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800">
              <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <History size={18} />
                </div>
                Conversion Rate History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {historyDates.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <History size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium">No history available</p>
                  <p className="text-xs mt-1">Rates will be logged each time you refresh</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyDates.map((date) => (
                    <div
                      key={date}
                      className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-500" />
                          <span className="text-sm font-bold text-white">{date}</span>
                        </div>
                        <Badge className="bg-slate-800 text-slate-400 border-slate-700 text-[10px] font-bold">
                          {settings?.baseCurrency} base
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(settings?.conversionHistory[date]
                          ? Object.entries(settings.conversionHistory[date])
                          : []
                        )
                          .filter(([code]) => (settings?.supportedCurrencies || []).includes(code))
                          .slice(0, 8)
                          .map(([code, rate]) => (
                            <div
                              key={code}
                              className="rounded-lg bg-slate-800/30 border border-slate-700/50 px-3 py-2"
                            >
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                {code}
                              </p>
                              <p className="text-sm font-bold text-white tabular-nums">{rate.toFixed(4)}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
