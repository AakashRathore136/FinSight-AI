/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Calendar, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { TrendPeriod } from '@/src/lib/trendsUtils';

interface PeriodSelectorProps {
  value: TrendPeriod;
  onChange: (period: TrendPeriod) => void;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
  className?: string;
}

const PERIODS: { key: TrendPeriod; label: string; icon: typeof Calendar }[] = [
  { key: 'week', label: 'Week', icon: CalendarClock },
  { key: 'month', label: 'Month', icon: CalendarDays },
  { key: 'quarter', label: 'Quarter', icon: CalendarRange },
  { key: 'custom', label: 'Custom', icon: Calendar },
];

export function PeriodSelector({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomChange,
  className,
}: PeriodSelectorProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl w-fit">
        {PERIODS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
              value === key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {value === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From</span>
            <input
              type="date"
              value={customStart || ''}
              onChange={(e) => onCustomChange?.(e.target.value, customEnd || '')}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To</span>
            <input
              type="date"
              value={customEnd || ''}
              onChange={(e) => onCustomChange?.(customStart || '', e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}
