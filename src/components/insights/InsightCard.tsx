/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InsightCard — a reusable card that renders a single spending insight with an
 * icon, title, plain-language description, and a severity/impact badge.
 */

import { useState, type ReactNode } from "react";
import {
    AlertTriangle,
  PiggyBank,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/utils";
import {
  formatCurrency,
  type Insight,
  type InsightType,
  type Severity,
} from "@/src/lib/insightsUtils";

// Severity → dark-theme colour tokens (amber / indigo / emerald palette).
const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; ring: string; iconWrap: string; label: string }
> = {
  high: {
    badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    ring: "ring-amber-500/20",
    iconWrap: "bg-amber-500/15 text-amber-300",
    label: "High impact",
  },
  medium: {
    badge: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
    ring: "ring-indigo-500/20",
    iconWrap: "bg-indigo-500/15 text-indigo-300",
    label: "Medium impact",
  },
  low: {
    badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    ring: "ring-emerald-500/20",
    iconWrap: "bg-emerald-500/15 text-emerald-300",
    label: "Low impact",
  },
};

const TYPE_ICON: Record<InsightType, ReactNode> = {
  weekly: <CalendarDays size={18} />,
  monthly: <CalendarRange size={18} />,
  anomaly: <AlertTriangle size={18} />,
  opportunity: <PiggyBank size={18} />,
};

const TYPE_LABEL: Record<InsightType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  anomaly: "Anomaly",
  opportunity: "Savings",
};

interface InsightCardProps {
  insight: Insight;
  /** Optional override icon. */
  icon?: ReactNode;
  className?: string;
  /** Base currency for the rendered figure. Defaults to the app-wide default. */
  baseCurrency?: string;
}

export function InsightCard({ insight, icon, className, baseCurrency }: InsightCardProps) {
  const [copied, setCopied] = useState(false);

  const styles = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.low;
  const typeIcon = icon ?? TYPE_ICON[insight.type] ?? <Sparkles size={18} />;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(insight.description);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy insight:", error);
    }
  };

  const amountLabel =
    insight.type === "opportunity"
      ? `${formatCurrency(insight.amount, baseCurrency)}/yr potential`
      : formatCurrency(insight.amount, baseCurrency);

  return (
    <Card
      className={cn(
        "group flex flex-col gap-3 bg-slate-900 border-slate-800 ring-1 p-5 transition-colors hover:bg-slate-900/70",
        styles.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              styles.iconWrap,
            )}
          >
            {typeIcon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {TYPE_LABEL[insight.type]}
              </span>
              <span className="text-slate-700">•</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 truncate">
                {insight.category}
              </span>
            </div>
            <h3 className="mt-0.5 text-sm font-semibold text-white leading-snug">
              {insight.title}
            </h3>
          </div>
        </div>

        <Badge className={cn("shrink-0 rounded-md px-2 py-0.5", styles.badge)}>
          {styles.label}
        </Badge>
      </div>

      <div className="space-y-2">
  <p className="text-xs leading-relaxed text-slate-400">
    {insight.description}
  </p>

  <button
    type="button"
    onClick={handleCopy}
    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
    aria-label={copied ? "Insight copied" : "Copy insight"}
  >
    {copied ? <Check size={13} /> : <Copy size={13} />}
    {copied ? "Copied!" : "Copy"}
  </button>
</div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[11px] font-medium text-slate-500">
          {insight.period}
        </span>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            insight.type === "opportunity"
              ? "text-emerald-300"
              : insight.severity === "high"
                ? "text-amber-300"
                : "text-slate-200",
          )}
        >
          {amountLabel}
        </span>
      </div>
    </Card>
  );
}

/**
 * A compact row used for category deltas (week-over-week / month-over-month).
 * Kept alongside InsightCard as a small, reusable presentational helper.
 */
export function CategoryDeltaRow({
  category,
  current,
  changePct,
  baseCurrency,
}: {
  category: string;
  current: number;
  changePct: number | null;
  baseCurrency?: string;
}) {
  const up = (changePct ?? 0) >= 0;
  const hasBaseline = changePct !== null;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-sm font-medium text-slate-200 truncate">
        {category}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-white tabular-nums">
          {formatCurrency(current, baseCurrency)}
        </span>
        {hasBaseline ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-bold tabular-nums w-16 justify-end",
              up ? "text-amber-300" : "text-emerald-300",
            )}
          >
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(Math.round(changePct as number))}%
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-500 w-16 text-right">
            new
          </span>
        )}
      </div>
    </div>
  );
}
