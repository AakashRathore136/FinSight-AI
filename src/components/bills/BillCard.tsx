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
import { Bell, CheckCircle2, AlertTriangle, Clock, Trash2 } from "lucide-react";
import {
  Bill,
  formatCurrency,
  getDaysUntilDue,
  isOverdue,
  isUpcoming,
} from "@/src/lib/billUtils";
import { toast } from "sonner";

interface BillCardProps {
  bill: Bill;
  onMarkPaid: (billId: string) => void;
  onDelete: (billId: string) => void;
}

export default function BillCard({
  bill,
  onMarkPaid,
  onDelete,
}: BillCardProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const daysUntil = getDaysUntilDue(bill.dueDate);
  const overdue = isOverdue(bill.dueDate, bill.isPaid);
  const upcoming = isUpcoming(bill.dueDate, 7);

  const handleMarkPaid = async () => {
    setActionLoading(true);
    try {
      await onMarkPaid(bill.id);
      toast.success(`${bill.name} marked as paid`);
    } catch (error) {
      toast.error("Failed to mark as paid");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = () => {
    if (bill.isPaid) return "border-emerald-500/30";
    if (overdue) return "border-red-500/30";
    if (upcoming) return "border-amber-500/30";
    return "border-slate-800";
  };

  const getStatusBadge = () => {
    if (bill.isPaid)
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">
          Paid
        </Badge>
      );
    if (overdue)
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-black uppercase tracking-wider">
          Overdue
        </Badge>
      );
    if (upcoming)
      return (
        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] font-black uppercase tracking-wider">
          Upcoming
        </Badge>
      );
    return (
      <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] font-black uppercase tracking-wider">
        Scheduled
      </Badge>
    );
  };

  return (
    <Card className={`bg-slate-900 border ${getStatusColor()} rounded-2xl`}>
      <CardHeader className="p-5 border-b border-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center ${bill.isPaid ? "bg-emerald-500/10 text-emerald-400" : overdue ? "bg-red-500/10 text-red-400" : upcoming ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-400"}`}
            >
              {bill.isPaid ? (
                <CheckCircle2 size={20} />
              ) : overdue ? (
                <AlertTriangle size={20} />
              ) : upcoming ? (
                <Clock size={20} />
              ) : (
                <Bell size={20} />
              )}
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white leading-tight">
                {bill.name}
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs mt-0.5">
                {bill.category}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Amount</span>
          <span className="text-lg font-black text-white tabular-nums">
            {formatCurrency(bill.amount)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Due Date</span>
          <span className="text-xs font-bold text-white">
            {new Date(bill.dueDate).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Frequency</span>
          <span className="text-xs font-bold text-white capitalize">
            {bill.frequency}
          </span>
        </div>
        {!bill.isPaid && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleMarkPaid}
              disabled={actionLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest h-9"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              Mark Paid
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(bill.id)}
              className="text-slate-500 hover:text-red-400 hover:bg-slate-800 h-9 w-9"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
