import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Progress } from "@/src/components/ui/progress";
import { Input } from "@/src/components/ui/input";
import {
  Target,
  Trash2,
  CheckCircle2,
  Calendar,
  TrendingUp,
} from "lucide-react";
import {
  Goal,
  formatCurrency,
  calculateDaysRemaining,
  checkGoalCompletion,
} from "@/src/lib/goalUtils";
import { toast } from "sonner";

interface GoalCardProps {
  goal: Goal;
  onUpdateProgress: (goalId: string, amount: number) => void;
  onDelete: (goalId: string) => void;
}

export function GoalCard({ goal, onUpdateProgress, onDelete }: GoalCardProps) {
  const [progressAmount, setProgressAmount] = useState("");
  const daysRemaining = calculateDaysRemaining(goal.deadline);
  const progressPercent = Math.min(
    Math.round((goal.currentAmount / goal.targetAmount) * 100),
    100,
  );
  const isCompleted = checkGoalCompletion(goal);

  const handleAddProgress = () => {
    const amount = parseFloat(progressAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    onUpdateProgress(goal.id, amount);
    setProgressAmount("");
  };

  return (
    <Card
      className={`bg-slate-900 border-slate-800 rounded-2xl ${isCompleted ? "border-emerald-500/30" : ""}`}
    >
      <CardHeader className="p-5 border-b border-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center ${isCompleted ? "bg-emerald-500/10 text-emerald-400" : "bg-indigo-500/10 text-indigo-400"}`}
            >
              {isCompleted ? <CheckCircle2 size={20} /> : <Target size={20} />}
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white leading-tight">
                {goal.name}
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs mt-0.5">
                {goal.category}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-500 hover:text-red-400 hover:bg-slate-800 h-8 w-8"
            onClick={() => onDelete(goal.id)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Progress</span>
          <span className="text-white font-bold tabular-nums">
            {formatCurrency(goal.currentAmount)} /{" "}
            {formatCurrency(goal.targetAmount)}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{progressPercent}% complete</span>
          <span className="text-slate-400">
            {formatCurrency(goal.targetAmount - goal.currentAmount)} remaining
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-slate-500 mb-1">
              <Calendar size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Deadline
              </span>
            </div>
            <p className="text-xs font-bold text-white">
              {daysRemaining > 0 ? `${daysRemaining} days left` : "Overdue"}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-slate-500 mb-1">
              <TrendingUp size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Monthly Need
              </span>
            </div>
            <p className="text-xs font-bold text-white">
              {formatCurrency(goal.suggestedMonthlyContribution)}
            </p>
          </div>
        </div>

        {!isCompleted && (
          <div className="flex gap-2">
            <Input
              type="number"
              value={progressAmount}
              onChange={(e) => setProgressAmount(e.target.value)}
              placeholder="Add progress..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-xs h-9"
            />
            <Button
              onClick={handleAddProgress}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-3"
            >
              Add
            </Button>
          </div>
        )}

        {isCompleted && (
          <Badge className="w-full justify-center bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
            <CheckCircle2 size={12} className="mr-1" />
            Goal Completed
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
