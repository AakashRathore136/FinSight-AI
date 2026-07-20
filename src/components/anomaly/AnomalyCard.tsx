import { Anomaly } from "@/src/lib/anomalyUtils";
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
import {
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Trash2,
  History,
  BarChart3,
} from "lucide-react";
import { formatRelativeTime, formatDateSafe } from "@/src/lib/utils";

interface AnomalyCardProps {
  anomaly: Anomaly;
  onDismiss: (id: string) => void;
  historicalCount?: number;
  historicalLabel?: string;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "large_transaction":
      return <DollarSign size={18} />;
    case "category_spike":
      return <BarChart3 size={18} />;
    case "unusual_pattern":
      return <TrendingUp size={18} />;
    default:
      return <AlertTriangle size={18} />;
  }
}

function getSeverity(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function getSeverityColor(severity: "high" | "medium" | "low") {
  switch (severity) {
    case "high":
      return {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-400",
        badge: "bg-red-500/15 text-red-400 border-red-500/30",
        progress: "bg-red-500",
      };
    case "medium":
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-400",
        badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        progress: "bg-amber-500",
      };
    case "low":
      return {
        bg: "bg-slate-500/10",
        border: "border-slate-500/30",
        text: "text-slate-400",
        badge: "bg-slate-500/15 text-slate-400 border-slate-500/30",
        progress: "bg-slate-500",
      };
  }
}

export function AnomalyCard({
  anomaly,
  onDismiss,
  historicalCount = 0,
  historicalLabel,
}: AnomalyCardProps) {
  const severity = getSeverity(anomaly.confidenceScore);
  const colors = getSeverityColor(severity);
  const icon = getTypeIcon(anomaly.type);

  return (
    <Card
      className={`
        ${colors.bg} ${colors.border} border rounded-xl overflow-hidden
        transition-all duration-200 hover:shadow-lg
      `}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div
              className={`h-10 w-10 rounded-lg ${colors.badge} flex items-center justify-center flex-shrink-0`}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`${colors.badge} border text-[10px] font-black uppercase tracking-widest`}
                >
                  {anomaly.type.replace("_", " ")}
                </Badge>
                <span className="text-xs text-slate-500 font-mono">
                  {anomaly.category}
                </span>
              </div>
              <p className="text-sm text-slate-200 font-medium leading-relaxed">
                {anomaly.description}
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                <span className="font-semibold text-white tabular-nums">
                  ${anomaly.amount.toLocaleString()}
                </span>
                <span>{formatRelativeTime(anomaly.createdAt)}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
            onClick={() => onDismiss(anomaly.id!)}
            title="Dismiss anomaly"
          >
            <Trash2 size={16} />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-semibold uppercase tracking-wider">
              Confidence
            </span>
            <span className={`font-mono font-bold ${colors.text}`}>
              {anomaly.confidenceScore}%
            </span>
          </div>
          <Progress value={anomaly.confidenceScore} className="h-1.5">
            <div
              className={`h-full rounded-full transition-all ${colors.progress}`}
              style={{ width: `${anomaly.confidenceScore}%` }}
            />
          </Progress>
        </div>

        {historicalCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
            <History size={14} className="text-slate-400" />
            <span>
              {historicalLabel ||
                `${historicalCount} similar ${historicalCount === 1 ? "anomaly" : "anomalies"} detected in the past 6 months`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
