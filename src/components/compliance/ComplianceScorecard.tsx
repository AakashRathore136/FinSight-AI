import React from "react";
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { ComplianceScore } from "@/src/lib/complianceUtils";

interface ComplianceScorecardProps {
  data: ComplianceScore;
}

export const ComplianceScorecard: React.FC<ComplianceScorecardProps> = ({ data }) => {
  const getStatusBadge = () => {
    switch (data.status) {
      case "COMPLIANT":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck size={14} /> Pass - Fully Compliant
          </span>
        );
      case "NEEDS_REVIEW":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle size={14} /> Action Required - Audit Review
          </span>
        );
      case "NON_COMPLIANT":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 border border-red-500/30 text-red-400">
            <ShieldAlert size={14} /> High Risk - Compliance Violation
          </span>
        );
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-6">
        <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-slate-950 border-4 border-indigo-500/30">
          <span className="text-3xl font-black text-white">{data.score}</span>
          <span className="absolute bottom-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Score</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white">Regulatory Audit Status</h3>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-400">
            Automated scanning across FinCEN AML guidelines & SOX section 404 audit directives.
          </p>
        </div>
      </div>

      <div className="flex gap-4 w-full md:w-auto">
        <div className="flex-1 md:flex-none px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
          <span className="block text-xs font-medium text-slate-400">Critical Red Flags</span>
          <span className="text-xl font-black text-red-400">{data.criticalViolationsCount}</span>
        </div>
        <div className="flex-1 md:flex-none px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
          <span className="block text-xs font-medium text-slate-400">Audit Warnings</span>
          <span className="text-xl font-black text-amber-400">{data.warningsCount}</span>
        </div>
      </div>
    </div>
  );
};
