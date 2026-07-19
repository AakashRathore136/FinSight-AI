import { Button } from '@/src/components/ui/button';

interface PeriodSelectorProps {
  period: 'week' | 'month' | 'quarter' | 'year';
  onPeriodChange: (period: 'week' | 'month' | 'quarter' | 'year') => void;
}

export default function PeriodSelector({ period, onPeriodChange }: PeriodSelectorProps) {
  const periods: { key: 'week' | 'month' | 'quarter' | 'year'; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
  ];

  return (
    <div className="inline-flex gap-1 bg-slate-800/50 p-1 rounded-lg">
      {periods.map(p => (
        <Button
          key={p.key}
          variant="ghost"
          size="sm"
          onClick={() => onPeriodChange(p.key)}
          className={`text-xs font-medium h-8 px-3 ${period === p.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
