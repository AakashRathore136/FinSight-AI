/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { db } from "@/src/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { getLocalDocumentById } from "@/src/lib/storageUtils";
import { formatDateSafe } from "@/src/lib/utils";
import {
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Layers,
  ExternalLink,
  Shield,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

interface DocumentQuickPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: any;
  user: any;
  onOpenFullReport: (id: string) => void;
}

export function DocumentQuickPreviewModal({
  isOpen,
  onClose,
  doc: docObj,
  user,
  onOpenFullReport,
}: DocumentQuickPreviewModalProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !docObj) return;

    let isMounted = true;
    setLoading(true);

    const loadAnalysis = async () => {
      if (docObj.latestAnalysis) {
        setAnalysis(docObj.latestAnalysis);
        setLoading(false);
        return;
      }

      // Try local storage
      try {
        const cached = getLocalDocumentById(docObj.id) as any;
        if (cached?.analysis) {
          setAnalysis(cached.analysis);
          setLoading(false);
          return;
        }
      } catch {
        // ignore cache read error
      }

      // Try Firestore
      if (user?.uid && !docObj.id.startsWith("local-")) {
        try {
          const q = query(
            collection(db, "documents", docObj.id, "analyses"),
            where("ownerId", "==", user.uid),
            orderBy("processedAt", "desc"),
            limit(1),
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            if (isMounted) {
              setAnalysis(snap.docs[0].data());
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to fetch analysis for preview:", docObj.id, e);
        }
      }

      if (isMounted) setLoading(false);
    };

    loadAnalysis();

    return () => {
      isMounted = false;
    };
  }, [isOpen, docObj, user]);

  if (!isOpen || !docObj) return null;

  const getRiskBadge = (risk: string) => {
    const r = String(risk || "low").toLowerCase();
    if (r === "high") {
      return (
        <Badge className="bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1">
          <AlertTriangle size={12} className="mr-1" /> High Risk
        </Badge>
      );
    }
    if (r === "medium") {
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-1">
          <AlertTriangle size={12} className="mr-1" /> Medium Risk
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1">
        <CheckCircle2 size={12} className="mr-1" /> Low Risk
      </Badge>
    );
  };

  const formatConfidence = (analysisData: any) => {
    if (!analysisData) return "N/A";
    if (analysisData.grounding && typeof analysisData.grounding.ratio === "number") {
      return `${Math.round(analysisData.grounding.ratio * 100)}%`;
    }
    const score = analysisData.sentiment_score ?? analysisData.sentimentScore;
    if (score !== undefined && score !== null) {
      const num = Number(score);
      if (!isNaN(num) && num !== 0) {
        const pct = num <= 1 ? Math.round(Math.abs(num) * 100) : Math.round(Math.min(100, Math.abs(num)));
        return `${pct}%`;
      }
    }
    return "N/A";
  };

  const keyMetrics = analysis?.key_metrics || analysis?.keyMetrics || docObj.latestAnalysis?.key_metrics || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-md">
                {docObj.fileName}
              </h2>
              <p className="text-xs text-slate-400">
                Uploaded {formatDateSafe(docObj.createdAt)} • {(Number(docObj.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8 p-0 rounded-lg"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-800/40 border border-slate-800 p-3.5 rounded-xl">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Risk Assessment</span>
              {getRiskBadge(docObj.riskLevel || analysis?.riskLevel || analysis?.risk_level)}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">AI Confidence</span>
              <span className="text-sm font-bold text-white font-mono">{formatConfidence(analysis)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Status</span>
              <Badge variant="outline" className="capitalize text-slate-300 border-slate-700">
                {docObj.status || "Completed"}
              </Badge>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Sparkles size={14} /> Stored Executive Summary
            </h3>
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl text-xs text-slate-300 leading-relaxed max-h-[200px] overflow-y-auto">
              {loading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-800 rounded w-full" />
                </div>
              ) : (
                analysis?.summary || docObj.latestAnalysis?.summary || "No executive summary is stored for this document."
              )}
            </div>
          </div>

          {/* Key Metrics */}
          {Object.keys(keyMetrics).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <TrendingUp size={14} /> Extracted Metrics
              </h3>
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl grid grid-cols-2 gap-3 max-h-[160px] overflow-y-auto">
                {Array.isArray(keyMetrics)
                  ? keyMetrics.map((m: any, idx: number) => (
                      <div key={idx} className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] text-slate-400 font-medium truncate">
                          {typeof m === "object" ? m.label || m.name || `Metric ${idx + 1}` : String(m)}
                        </p>
                        <p className="text-xs font-bold text-white font-mono">
                          {typeof m === "object" ? String(m.value || m.val || "--") : "--"}
                        </p>
                      </div>
                    ))
                  : Object.entries(keyMetrics).map(([k, v], idx) => (
                      <div key={idx} className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] text-slate-400 font-medium capitalize truncate">
                          {k.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs font-bold text-white font-mono truncate">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </p>
                      </div>
                    ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {Array.isArray(analysis?.action_items || docObj.latestAnalysis?.action_items) &&
            (analysis?.action_items || docObj.latestAnalysis?.action_items).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Layers size={14} /> Key Recommendations
                </h3>
                <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl text-xs text-slate-300">
                  <ul className="list-disc list-inside space-y-1">
                    {(analysis?.action_items || docObj.latestAnalysis?.action_items).map(
                      (item: string, idx: number) => (
                        <li key={idx} className="leading-snug">
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 hover:bg-slate-800">
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onOpenFullReport(docObj.id);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            <ExternalLink size={14} className="mr-1.5" /> View Full Intelligence Report
          </Button>
        </div>
      </div>
    </div>
  );
}
