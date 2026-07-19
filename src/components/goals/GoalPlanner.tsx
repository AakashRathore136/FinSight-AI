import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Progress } from '@/src/components/ui/progress';
import { Input } from '@/src/components/ui/input';
import { Target, Loader2, Plus, Trash2, CheckCircle2, Calendar, TrendingUp, RefreshCw } from 'lucide-react';
import { GoalCard } from '@/src/components/goals/GoalCard';
import {
  fetchUserGoals,
  createGoal,
  updateGoalProgress,
  deleteGoal,
  calculateMonthlyContribution,
  calculateDaysRemaining,
  checkGoalCompletion,
  Goal,
  formatCurrency,
} from '@/src/lib/goalUtils';
import { toast } from 'sonner';

export function GoalPlanner({ user }: { user: any }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    targetAmount: '',
    deadline: '',
    category: 'Savings',
  });

  useEffect(() => {
    loadGoals();
  }, [user]);

  async function loadGoals() {
    if (!user) return;
    setLoading(true);
    try {
      const userGoals = await fetchUserGoals(user.uid);
      setGoals(userGoals);
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newGoal.name || !newGoal.targetAmount || !newGoal.deadline) return;
    try {
      const targetAmount = parseFloat(newGoal.targetAmount);
      const deadlineDate = new Date(newGoal.deadline);
      const monthlyContribution = calculateMonthlyContribution(targetAmount, deadlineDate);
      const goal: Omit<Goal, 'id'> = {
        userId: user.uid,
        name: newGoal.name,
        targetAmount,
        currentAmount: 0,
        deadline: deadlineDate.toISOString(),
        category: newGoal.category,
        suggestedMonthlyContribution: monthlyContribution,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      await createGoal(goal);
      toast.success('Goal created successfully!');
      setNewGoal({ name: '', targetAmount: '', deadline: '', category: 'Savings' });
      setShowForm(false);
      loadGoals();
    } catch (error) {
      console.error('Failed to create goal:', error);
      toast.error('Failed to create goal');
    }
  }

  async function handleUpdateProgress(goalId: string, amount: number) {
    try {
      await updateGoalProgress(goalId, amount);
      toast.success('Progress updated!');
      loadGoals();
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  }

  async function handleDeleteGoal(goalId: string) {
    try {
      await deleteGoal(goalId);
      toast.success('Goal deleted');
      loadGoals();
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  }

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Financial Goals</h1>
            <p className="text-slate-500 text-sm mt-2">Track and achieve your savings targets</p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">Loading your goals...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Financial Goals</h1>
          <p className="text-slate-500 text-sm mt-2">Plan, track, and achieve your financial targets</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest h-10 px-4 rounded-xl"
        >
          <Plus className="mr-2" size={16} />
          New Goal
        </Button>
      </section>

      {showForm && (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="p-5 border-b border-slate-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">Create New Goal</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={handleCreateGoal} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Goal Name</label>
                <Input
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                  placeholder="e.g., Vacation Fund"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Target Amount ($)</label>
                <Input
                  type="number"
                  value={newGoal.targetAmount}
                  onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                  placeholder="5000"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Deadline</label>
                <Input
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Category</label>
                <select
                  value={newGoal.category}
                  onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-300 h-10 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Savings">Savings</option>
                  <option value="Investment">Investment</option>
                  <option value="Emergency">Emergency Fund</option>
                  <option value="Purchase">Major Purchase</option>
                  <option value="Travel">Travel</option>
                </select>
              </div>
              <div className="md:col-span-2 flex gap-3">
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest">
                  Create Goal
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Active Goals</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdateProgress={handleUpdateProgress}
                onDelete={handleDeleteGoal}
              />
            ))}
          </div>
        </div>
      )}

      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Completed Goals</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdateProgress={handleUpdateProgress}
                onDelete={handleDeleteGoal}
              />
            ))}
          </div>
        </div>
      )}

      {goals.length === 0 && !loading && (
        <Card className="bg-slate-900 border-slate-800 border-dashed rounded-2xl">
          <CardContent className="p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center mx-auto">
              <Target size={24} />
            </div>
            <p className="text-slate-400 font-medium">No goals yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Create your first financial goal to start tracking your progress and build consistent saving habits.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
