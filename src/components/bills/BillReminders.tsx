import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Bell, Loader2, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import BillCard from '@/src/components/bills/BillCard';
import {
  fetchUserBills,
  createBill,
  deleteBill,
  markBillAsPaid,
  getUpcomingBills,
  getOverdueBills,
  calculateMonthlyObligations,
  generateRecurringSchedule,
  Bill,
  formatCurrency,
} from '@/src/lib/billUtils';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function BillReminders({ user }: { user: any }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newBill, setNewBill] = useState({
    name: '',
    amount: '',
    dueDate: '',
    frequency: 'monthly' as Bill['frequency'],
    category: 'Bills',
  });

  useEffect(() => {
    loadBills();
  }, [user]);

  async function loadBills() {
    if (!user) return;
    setLoading(true);
    try {
      const userBills = await fetchUserBills(user.uid);
      setBills(userBills);
    } catch (error) {
      console.error('Failed to load bills:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newBill.name || !newBill.amount || !newBill.dueDate) return;
    try {
      const amount = parseFloat(newBill.amount);
      const nextDueDate = new BillFrequency()[newBill.frequency] ? newBill.dueDate : newBill.dueDate;
      await createBill({
        userId: user.uid,
        name: newBill.name,
        amount,
        dueDate: newBill.dueDate,
        frequency: newBill.frequency,
        category: newBill.category,
        isPaid: false,
        createdAt: new Date().toISOString(),
        nextDueDate,
      });
      toast.success('Bill reminder created!');
      setNewBill({ name: '', amount: '', dueDate: '', frequency: 'monthly', category: 'Bills' });
      setShowForm(false);
      loadBills();
    } catch (error) {
      console.error('Failed to create bill:', error);
      toast.error('Failed to create bill');
    }
  }

  async function handleMarkPaid(billId: string) {
    try {
      await markBillAsPaid(billId);
      loadBills();
    } catch (error) {
      throw error;
    }
  }

  async function handleDeleteBill(billId: string) {
    try {
      await deleteBill(billId);
      toast.success('Bill reminder deleted');
      loadBills();
    } catch (error) {
      console.error('Failed to delete bill:', error);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadBills();
    setRefreshing(false);
  }

  const upcomingBills = getUpcomingBills(bills, 7);
  const overdueBills = getOverdueBills(bills);
  const monthlyObligations = calculateMonthlyObligations(bills);
  const schedule = generateRecurringSchedule(bills);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Bill Reminders</h1>
            <p className="text-slate-500 text-sm mt-2">Never miss a payment deadline</p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">Loading reminders...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Bill Reminders</h1>
          <p className="text-slate-500 text-sm mt-2">Track bills, subscriptions, and never miss a payment</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-9 w-9 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest h-10 px-4 rounded-xl"
          >
            <Plus className="mr-2" size={16} />
            Add Bill
          </Button>
        </div>
      </section>

      {showForm && (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">New Bill Reminder</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={handleCreateBill} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Bill Name</label>
                <Input
                  value={newBill.name}
                  onChange={(e) => setNewBill({ ...newBill, name: e.target.value })}
                  placeholder="e.g., Electric Bill"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Amount ($)</label>
                <Input
                  type="number"
                  value={newBill.amount}
                  onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
                  placeholder="150"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Due Date</label>
                <Input
                  type="date"
                  value={newBill.dueDate}
                  onChange={(e) => setNewBill({ ...newBill, dueDate: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Frequency</label>
                <select
                  value={newBill.frequency}
                  onChange={(e) => setNewBill({ ...newBill, frequency: e.target.value as Bill['frequency'] })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="md:col-span-2 flex gap-3">
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest">
                  Create Reminder
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-600/10 flex items-center justify-center text-amber-400 shadow-inner">
                <Bell className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Upcoming Bills</p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">{upcomingBills.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-red-600/10 flex items-center justify-center text-red-400 shadow-inner">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Overdue Bills</p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">{overdueBills.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 shadow-inner">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Monthly Obligations</p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">{formatCurrency(monthlyObligations)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-slate-800/50 p-1 rounded-lg">
          <TabsTrigger value="all" className="text-xs font-medium">All Bills</TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs font-medium">Upcoming</TabsTrigger>
          <TabsTrigger value="overdue" className="text-xs font-medium">Overdue</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          {bills.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bills.map((bill) => (
                <BillCard key={bill.id} bill={bill} onMarkPaid={handleMarkPaid} onDelete={handleDeleteBill} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          {upcomingBills.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No upcoming bills in the next 7 days</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} onMarkPaid={handleMarkPaid} onDelete={handleDeleteBill} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          {overdueBills.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No overdue bills</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {overdueBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} onMarkPaid={handleMarkPaid} onDelete={handleDeleteBill} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {bills.length > 0 && (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">Weekly Schedule</CardTitle>
            <CardDescription className="text-slate-500 text-xs">When your bills are due</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schedule} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f1219', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#f8fafc' }} labelStyle={{ color: '#94a3b8' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="bg-slate-900 border-slate-800 border-dashed rounded-2xl">
      <CardContent className="p-12 text-center space-y-3">
        <div className="h-12 w-12 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center mx-auto">
          <Bell size={24} />
        </div>
        <p className="text-slate-400 font-medium">No bill reminders yet</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Add your first bill reminder to start tracking payments and avoid late fees.
        </p>
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
