import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { ShieldCheck, ShieldAlert, FileText, CheckCircle2, AlertOctagon } from "lucide-react";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { auditFinancialData } from "@/src/lib/complianceUtils";

export const ComplianceAuditDashboard: React.FC = () => {
  // Sample transactions for compliance demonstration
  const [mockTransactions] = useState([
    { amount: 9850, description: "Consulting Fee Deposit", date: "2026-08-01", category: "Revenue" },
    { amount: 9900, description: "Vendor Wire Transfer", date: "2026-08-02", category: "Vendor" },
    { amount: -65000, description: "Unclassified Special Transfer", date: "2026-08-03", category: "Other" },
    { amount: 30000, description: "Inbound Wire Co", date: "2026-08-04", category: "Revenue" },
    { amount: -28000, description: "Outbound Immediate Transfer", date: "2026-08-05", category: "Withdrawal" },
  ]);

  const auditResult = auditFinancialData(mockTransactions);
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { ShieldAlert, FileText, CheckCircle2, AlertOctagon, Loader2 } from "lucide-react";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { auditFinancialData } from "@/src/lib/complianceUtils";
import { fetchUserTransactions } from "@/src/lib/cashflowUtils";

export const ComplianceAuditDashboard: React.FC<{ user?: any }> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<ReturnType<typeof auditFinancialData> | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadComplianceData();
  }, [user]);

  async function loadComplianceData() {
    setLoading(true);
    setError(null);
    try {
      const transactions = await fetchUserTransactions(user.uid, 12);
      const realTransactions = transactions.map((t) => ({
        amount: t.amount,
        description: t.description || "",
        date: t.date instanceof Date ? t.date.toISOString().split("T")[0] : String(t.date),
        category: t.category,
      }));
      const result = auditFinancialData(realTransactions);
      setAuditResult(result);
    } catch (err) {
      setError("Failed to load compliance data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <ShieldAlert size={24} className="mr-3" />
        Please sign in to view compliance audit.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Loader2 size={24} className="mr-3 animate-spin" />
        Loading compliance audit...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-red-400">
        <AlertOctagon size={24} className="mr-3" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComplianceScorecard data={auditResult} />

      <Card className="bg-slate-900 border-slate-800 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldAlert size={22} />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-white">Flagged Red-Flag Violations</CardTitle>
              <p className="text-xs text-slate-400">Detected compliance exceptions requiring officer sign-off</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {auditResult.violations.length === 0 ? (
          {auditResult?.violations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800">
              <CheckCircle2 size={40} className="text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-200">No Regulatory Violations Detected</p>
              <p className="text-xs text-slate-500">All ledger items comply with AML thresholds & SOX directives.</p>
            </div>
          ) : (
            auditResult.violations.map((v) => (
            auditResult?.violations.map((v) => (
              <div
                key={v.id}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        v.severity === "high"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {v.category} • {v.severity}
                      {v.category} - {v.severity}
                    </span>
                    <h4 className="text-sm font-bold text-white">{v.title}</h4>
                  </div>
                  <p className="text-xs text-slate-400">{v.description}</p>
                  <p className="text-xs text-indigo-400 font-medium">Action: {v.recommendedAction}</p>
                </div>
                <button className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5">
                  <FileText size={14} /> File Report
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
