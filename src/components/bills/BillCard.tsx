/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format, formatDistanceToNow } from 'date-fns';
import { Calendar, CreditCard, Tag, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { cn, formatCurrency, toDate } from '@/src/lib/utils';
import { type Bill, getDaysUntilDue, isOverdue } from '@/src/lib/billUtils';

interface BillCardProps {
  bill: Bill;
  onPay: (bill: Bill) => void;
  onDelete: (billId: string) => void;
  disabled?: boolean;
}

const FREQUENCY_LABELS: Record<Bill['frequency'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
};

export function BillCard({ bill, onPay, onDelete, disabled }: BillCardProps) {
  const overdue = isOverdue(bill);
  const daysUntil = getDaysUntilDue(bill);
  const dueDate = toDate(bill.nextDueDate || bill.dueDate);
  const accent = overdue ? 'red' : bill.isPaid ? 'emerald' : daysUntil <= 7 ? 'amber' : 'slate';

  const accentClasses = {
    red: 'border-red-500/40 bg-red-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    slate: 'border-slate-800 bg-slate-900',
  }[accent];

  const iconClasses = {
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    slate: 'bg-slate-800 border-slate-700 text-slate-400',
  }[accent];

  const statusBadge = overdue ? (
    <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] uppercase tracking-wider">
      Overdue
    </Badge>
  ) : bill.isPaid ? (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase tracking-wider">
      Paid
    </Badge>
  ) : daysUntil <= 7 ? (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] uppercase tracking-wider">
      Upcoming
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-600/40 text-[10px] uppercase tracking-wider">
      Scheduled
    </Badge>
  );

  return (
    <Card className={cn('border shadow-lg shadow-black/20 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors duration-200', accentClasses)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center flex-shrink-0', iconClasses)}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-white font-semibold truncate text-base">
                {bill.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {statusBadge}
                <span className="text-xs text-slate-500">{FREQUENCY_LABELS[bill.frequency]}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(bill.id)}
            className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
          >
            <AlertTriangle size={16} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">
              {formatCurrency(bill.amount)}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
              per {bill.frequency === 'custom' ? 'cycle' : bill.frequency.replace('ly', '')}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 justify-end">
              <Calendar size={12} />
              <span>Due</span>
            </div>
            <p className={cn(
              'text-sm font-semibold',
              overdue ? 'text-red-400' : bill.isPaid ? 'text-emerald-400' : 'text-white'
            )}>
              {dueDate ? format(dueDate, 'MMM d, yyyy') : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Tag size={12} />
              <span>Category</span>
            </div>
            <p className="text-sm font-semibold text-white truncate">{bill.category}</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Clock size={12} />
              <span>Status</span>
            </div>
            <p className={cn(
              'text-sm font-semibold',
              overdue ? 'text-red-400' : bill.isPaid ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {bill.isPaid
                ? 'Paid'
                : overdue
                  ? `${Math.abs(daysUntil)} days late`
                  : daysUntil === 0
                    ? 'Due today'
                    : `${daysUntil} days left`}
            </p>
          </div>
        </div>

        {bill.isPaid && bill.lastPaidDate && (
          <p className="text-[10px] text-emerald-500/80 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Paid {formatDistanceToNow(toDate(bill.lastPaidDate) || new Date(), { addSuffix: true })}
          </p>
        )}

        {!bill.isPaid && (
          <Button
            onClick={() => onPay(bill)}
            disabled={disabled}
            className={cn(
              'w-full font-semibold text-sm rounded-lg h-10',
              overdue
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            )}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Mark as Paid
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
