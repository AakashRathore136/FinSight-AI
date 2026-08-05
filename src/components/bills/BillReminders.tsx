/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfDay,
  addDays,
} from 'date-fns';
import {
  Bell,
  Plus,
  Calendar,
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle2,
  X,
  BellRing,
  Repeat,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { cn, formatCurrency } from '@/src/lib/utils';
import { BillCard } from './BillCard';
import {
  type Bill,
  type BillFrequency,
  type BillInput,
  fetchUserBills,
  createBill,
  softDeleteBill,
  markBillAsPaid,
  getUpcomingBills,
  getOverdueBills,
  calculateMonthlyObligations,
  getDaysUntilDue,
  generateRecurringSchedule,
} from '@/src/lib/billUtils';

interface BillRemindersProps {
  user: import('firebase/auth').User | null;
}

const FREQUENCIES: BillFrequency[] = ['weekly', 'monthly', 'yearly', 'custom'];
const CATEGORIES = ['Utilities', 'Subscription', 'Housing', 'Insurance', 'Loan', 'Entertainment', 'General'];

export function BillReminders({ user }: BillRemindersProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formFrequency, setFormFrequency] = useState<BillFrequency>('monthly');
  const [formCategory, setFormCategory] = useState('Subscription');

  const today = startOfDay(new Date());

  // Derive loading state
  const loading = !user || isLoading;

  useEffect(() => {
    if (!user) {
       
      setBills([]);
      setLoading(false);
      return;
    }
    const cancelled = false;
    let loadingState = true;

     
    setIsLoading(true);

    fetchUserBills(user.uid)
      .then((fetched) => {
        if (!cancelled && loadingState) {
          loadingState = false;
          setBills(fetched);
        }
      })
      .catch(() => {
        if (!cancelled && loadingState) {
          loadingState = false;
          setBills([]);
        }
      })
      .finally(() => {
        if (!cancelled && loadingState) {
          loadingState = false;
           
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  const overdueBills = useMemo(() => getOverdueBills(bills, today), [bills, today]);
  const upcomingBills = useMemo(() => getUpcomingBills(bills, today), [bills, today]);
  const activeBills = useMemo(() => bills.filter((b) => !b.isPaid), [bills]);
  const monthlyObligations = useMemo(() => calculateMonthlyObligations(bills), [bills]);

  const scheduleData = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      byDay[format(d, 'EEE')] = 0;
    }
    upcomingBills.forEach((b) => {
      const due = new Date(b.nextDueDate || b.dueDate);
      const idx = getDaysUntilDue(b, today);
      if (idx >= 0 && idx < 7) {
        const key = format(addDays(today, idx), 'EEE');
        byDay[key] = (byDay[key] || 0) + b.amount;
      }
    });
    return Object.entries(byDay).map(([day, amount]) => ({ day, amount }));
  }, [upcomingBills, today]);

  const handleAddBill = async () => {
    if (!user) return;
    if (!formName.trim()) {
      toast.error('Please enter a bill name');
      return;
    }
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!formDueDate) {
      toast.error('Please select a due date');
      return;
    }

    const input: BillInput = {
      name: formName.trim(),
      amount,
      dueDate: formDueDate,
      frequency: formFrequency,
      category: formCategory,
    };

    const created = await createBill(user.uid, input);
    if (created) {
      setBills((prev) => [...prev, created].sort((a, b) => {
        const da = a.nextDueDate || a.dueDate;
        const db = b.nextDueDate || b.dueDate;
        return new Date(da).getTime() - new Date(db).getTime();
      }));
      toast.success(`Bill "${created.name}" added`);
      setFormName('');
      setFormAmount('');
      setFormDueDate('');
      setFormFrequency('monthly');
      setFormCategory('Subscription');
      setShowAddForm(false);
    } else {
      toast.error('Failed to add bill');
    }
  };

  const handlePay = async (bill: Bill) => {
    if (!user) return;
    const ok = await markBillAsPaid(bill, user.uid);
    if (ok) {
      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id
            ? {
                ...b,
                isPaid: true,
                lastPaidDate: new Date().toISOString(),
                nextDueDate: generateRecurringSchedule(
                  { ...b, isPaid: true, lastPaidDate: new Date().toISOString() },
                  new Date(),
                  1
                )[0] || b.nextDueDate,
              }
            : b
        )
      );
      toast.success(`${bill.name} marked as paid`, {
        description: `${formatCurrency(bill.amount)} recorded as expense`,
      });
    } else {
      toast.error('Failed to mark bill as paid');
    }
  };

  const handleDelete = async (billId: string) => {
    const ok = await softDeleteBill(billId);
    if (ok) {
      setBills((prev) => prev.filter((b) => b.id !== billId));
      toast.success('Bill removed');
    } else {
      toast.error('Failed to remove bill');
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Bell className="h-7 w-7 text-indigo-400" />
            Bill & Subscription Reminders
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Stay on top of recurring payments and never miss a due date
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-900/20 rounded-xl h-10 px-4"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Bill
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Overdue"
          value={overdueBills.length.toString()}
          sub={formatCurrency(overdueBills.reduce((s, b) => s + b.amount, 0))}
          accent="red"
        />
        <SummaryCard
          icon={<BellRing className="h-5 w-5" />}
          label="Due This Week"
          value={upcomingBills.length.toString()}
          sub={formatCurrency(upcomingBills.reduce((s, b) => s + b.amount, 0))}
          accent="amber"
        />
        <SummaryCard
          icon={<Calendar className="h-5 w-5" />}
          label="Monthly Obligations"
          value={formatCurrency(monthlyObligations)}
          sub={`${activeBills.length} active bills`}
          accent="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-white text-lg">Add New Bill</CardTitle>
                        <CardDescription className="text-slate-500 text-xs mt-1">
                          Track a recurring payment or subscription
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowAddForm(false)}
                        className="text-slate-500 hover:text-slate-300 h-8 w-8"
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Bill Name">
                        <Input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g., Netflix"
                          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                        />
                      </Field>
                      <Field label="Amount">
                        <Input
                          type="number"
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
                          placeholder="0.00"
                          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-10 rounded-lg"
                          min="0"
                          step="0.01"
                        />
                      </Field>
                      <Field label="Due Date">
                        <Input
                          type="date"
                          value={formDueDate}
                          onChange={(e) => setFormDueDate(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white h-10 rounded-lg"
                        />
                      </Field>
                      <Field label="Frequency">
                        <select
                          value={formFrequency}
                          onChange={(e) => setFormFrequency(e.target.value as BillFrequency)}
                          className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none text-sm"
                        >
                          {FREQUENCIES.map((f) => (
                            <option key={f} value={f} className="capitalize">
                              {f}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Category" className="md:col-span-2">
                        <select
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => setShowAddForm(false)}
                        className="text-slate-400 hover:text-slate-300 rounded-lg h-9 px-4 text-sm"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddBill}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg h-9 px-6 text-sm"
                      >
                        Add Bill
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1">
              <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                All Bills
              </TabsTrigger>
              <TabsTrigger value="overdue" className="rounded-lg data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300">
                Overdue
                {overdueBills.length > 0 && (
                  <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                    {overdueBills.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="rounded-lg data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
                Upcoming
                {upcomingBills.length > 0 && (
                  <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                    {upcomingBills.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <BillGrid bills={bills} onPay={handlePay} onDelete={handleDelete} loading={loading} emptyLabel="No bills yet" />
            </TabsContent>
            <TabsContent value="overdue" className="mt-4">
              <BillGrid bills={overdueBills} onPay={handlePay} onDelete={handleDelete} loading={loading} emptyLabel="No overdue bills" emptyIcon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />} />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-4">
              <BillGrid bills={upcomingBills} onPay={handlePay} onDelete={handleDelete} loading={loading} emptyLabel="Nothing due in the next 7 days" />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-400" />
                <CardTitle className="text-white text-sm">Notification Center</CardTitle>
              </div>
              <CardDescription className="text-slate-500 text-xs">
                Bills due in the next 7 days
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-72 overflow-y-auto">
              {upcomingBills.length === 0 && overdueBills.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">
                  You're all caught up
                </p>
              )}
              {overdueBills.map((b) => (
                <NotificationRow key={`o-${b.id}`} bill={b} tone="red" />
              ))}
              {upcomingBills.map((b) => (
                <NotificationRow key={`u-${b.id}`} bill={b} tone="amber" />
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-indigo-400" />
                <CardTitle className="text-white text-sm">Weekly Schedule</CardTitle>
              </div>
              <CardDescription className="text-slate-500 text-xs">
                Upcoming obligations by day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scheduleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(value: number) => [formatCurrency(value), 'Due']}
                    />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
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
  accent: 'red' | 'amber' | 'indigo';
}) {
  const accentMap = {
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
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

function NotificationRow({ bill, tone }: { bill: Bill; tone: 'red' | 'amber' }) {
  const days = getDaysUntilDue(bill);
  const due = new Date(bill.nextDueDate || bill.dueDate);
  const accent = tone === 'red'
    ? 'border-red-500/30 bg-red-500/5'
    : 'border-amber-500/30 bg-amber-500/5';
  const textAccent = tone === 'red' ? 'text-red-400' : 'text-amber-400';

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', accent)}>
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', textAccent, tone === 'red' ? 'bg-red-500/10' : 'bg-amber-500/10')}>
        {tone === 'red' ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{bill.name}</p>
        <p className={cn('text-[10px]', textAccent)}>
          {tone === 'red' ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`}
          {' · '}{format(due, 'MMM d')}
        </p>
      </div>
      <span className="text-sm font-semibold text-white tabular-nums">{formatCurrency(bill.amount)}</span>
    </div>
  );
}

function BillGrid({
  bills,
  onPay,
  onDelete,
  loading,
  emptyLabel,
  emptyIcon,
}: {
  bills: Bill[];
  onPay: (bill: Bill) => void;
  onDelete: (id: string) => void;
  loading: boolean;
  emptyLabel: string;
  emptyIcon?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-48 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900 shadow-lg rounded-2xl">
        <CardContent className="py-16 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
            {emptyIcon || <CreditCard className="h-8 w-8 text-slate-500" />}
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">{emptyLabel}</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Add a bill or subscription to start tracking your recurring payments.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AnimatePresence>
        {bills.map((bill) => (
          <motion.div
            key={bill.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <BillCard bill={bill} onPay={onPay} onDelete={onDelete} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
