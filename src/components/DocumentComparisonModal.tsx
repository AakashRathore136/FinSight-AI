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
  Scale,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

interface DocumentComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  docs: any[];
  user: any;
  onSelectDoc: (id: string) => void;
}

export function DocumentComparisonModal({
  isOpen,
  onClose,
  docs,
  user,
  onSelectDoc,
}: DocumentComparisonModalProps) {
  const [doc1Analysis, setDoc1Analysis] = useState<any>(null);
  const [doc2Analysis, setDoc2Analysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || docs.length < 2) return;

    let isMounted = true;
    setLoading(true);

    const loadAnalyses = async () => {
      const fetchAnalysisForDoc = async (docObj: any) => {
        if (!docObj) return null;
        if (docObj.latestAnalysis) return docObj.latestAnalysis;

        // Try local storage cache
        try {
          const cached = getLocalDocumentById(docObj.id) as any;
          if (cached?.analysis) return cached.analysis;
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
              return snap.docs[0].data();
            }
          } catch (e) {
            console.warn("Failed to fetch analysis for comparison:", docObj.id, e);
          }
        }
        return null;
      };

      try {
        const [a1, a2] = await Promise.all([
          fetchAnalysisForDoc(docs[0]),
          fetchAnalysisForDoc(docs[1]),
        ]);
        if (isMounted) {
          setDoc1Analysis(a1);
          setDoc2Analysis(a2);
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    };

    loadAnalyses();

    return () => {
      isMounted = false;
    };
  }, [isOpen, docs, user]);

  if (!isOpen || docs.length < 2) return null;

  const doc1 = docs[0];
  const doc2 = docs[1];

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

  const renderKeyMetrics = (analysisData: any) => {
    if (!analysisData?.key_metrics && !analysisData?.keyMetrics) {
      return <p className="text-xs text-slate-500 italic">No key metrics extracted.</p>;
    }
    const metrics = analysisData.key_metrics || analysisData.keyMetrics;
    if (Array.isArray(metrics)) {
      if (metrics.length === 0) return <p className="text-xs text-slate-500 italic">No key metrics extracted.</p>;
      return (
        <div className="space-y-1.5">
          {metrics.map((m: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800/60 pb-1">
              <span className="text-slate-400 font-medium">{typeof m === "object" ? m.label || m.name || `Metric ${idx + 1}` : String(m)}</span>
              <span className="text-white font-mono">{typeof m === "object" ? String(m.value || m.val || "--") : "--"}</span>
            </div>
          ))}
        </div>
      );
    }
    if (typeof metrics === "object") {
      const entries = Object.entries(metrics);
      if (entries.length === 0) return <p className="text-xs text-slate-500 italic">No key metrics extracted.</p>;
      return (
        <div className="space-y-1.5">
          {entries.map(([key, val], idx) => (
            <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800/60 pb-1">
              <span className="text-slate-400 font-medium capitalize">{key.replace(/_/g, " ")}</span>
              <span className="text-white font-mono">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
            </div>
          ))}
        </div>
      );
    }
    return <p className="text-xs text-slate-300">{String(metrics)}</p>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Scale size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Side-by-Side Analysis Comparison
                <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30">
                  Dual Mode
                </Badge>
              </h2>
              <p className="text-xs text-slate-400">
                Comparing risk profiles, executive summaries, and extracted financial metrics.
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

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Document Headers */}
          <div className="grid grid-cols-2 gap-6">
            {/* Document 1 Header */}
            <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-400 shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate" title={doc1.fileName}>
                      {doc1.fileName}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Uploaded {formatDateSafe(doc1.createdAt)} • {(Number(doc1.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onSelectDoc(doc1.id);
                  }}
                  className="h-8 text-xs border-slate-700 hover:bg-indigo-600 hover:text-white shrink-0"
                >
                  <ExternalLink size={12} className="mr-1" /> Open
                </Button>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div>{getRiskBadge(doc1.riskLevel || doc1Analysis?.riskLevel || doc1Analysis?.risk_level)}</div>
                <div className="text-xs text-slate-400">
                  Confidence: <span className="font-bold text-white">{formatConfidence(doc1Analysis)}</span>
                </div>
              </div>
            </div>

            {/* Document 2 Header */}
            <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-purple-400 shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate" title={doc2.fileName}>
                      {doc2.fileName}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Uploaded {formatDateSafe(doc2.createdAt)} • {(Number(doc2.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onSelectDoc(doc2.id);
                  }}
                  className="h-8 text-xs border-slate-700 hover:bg-indigo-600 hover:text-white shrink-0"
                >
                  <ExternalLink size={12} className="mr-1" /> Open
                </Button>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div>{getRiskBadge(doc2.riskLevel || doc2Analysis?.riskLevel || doc2Analysis?.risk_level)}</div>
                <div className="text-xs text-slate-400">
                  Confidence: <span className="font-bold text-white">{formatConfidence(doc2Analysis)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Executive Summary Comparison */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
              <Sparkles size={14} /> AI Executive Summary
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl text-xs text-slate-300 leading-relaxed min-h-[120px] max-h-[220px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800 rounded w-full" />
                    <div className="h-3 bg-slate-800 rounded w-5/6" />
                  </div>
                ) : (
                  doc1Analysis?.summary || doc1.latestAnalysis?.summary || "No summary available for this analysis."
                )}
              </div>
              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl text-xs text-slate-300 leading-relaxed min-h-[120px] max-h-[220px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800 rounded w-full" />
                    <div className="h-3 bg-slate-800 rounded w-5/6" />
                  </div>
                ) : (
                  doc2Analysis?.summary || doc2.latestAnalysis?.summary || "No summary available for this analysis."
                )}
              </div>
            </div>
          </div>

          {/* Section: Key Financial Metrics Comparison */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
              <TrendingUp size={14} /> Extracted Financial Metrics
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl min-h-[100px] max-h-[220px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-1/2" />
                    <div className="h-3 bg-slate-800 rounded w-2/3" />
                  </div>
                ) : (
                  renderKeyMetrics(doc1Analysis || doc1.latestAnalysis)
                )}
              </div>
              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl min-h-[100px] max-h-[220px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-1/2" />
                    <div className="h-3 bg-slate-800 rounded w-2/3" />
                  </div>
                ) : (
                  renderKeyMetrics(doc2Analysis || doc2.latestAnalysis)
                )}
              </div>
            </div>
          </div>

          {/* Section: Action Items & Recommendations */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
              <Layers size={14} /> Key Action Items & Recommendations
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl text-xs text-slate-300 min-h-[80px] max-h-[180px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                  </div>
                ) : Array.isArray(doc1Analysis?.action_items || doc1.latestAnalysis?.action_items) &&
                  (doc1Analysis?.action_items || doc1.latestAnalysis?.action_items).length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {(doc1Analysis?.action_items || doc1.latestAnalysis?.action_items).map(
                      (item: string, idx: number) => (
                        <li key={idx} className="leading-snug">
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="text-slate-500 italic">No specific action items listed.</p>
                )}
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl text-xs text-slate-300 min-h-[80px] max-h-[180px] overflow-y-auto">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                  </div>
                ) : Array.isArray(doc2Analysis?.action_items || doc2.latestAnalysis?.action_items) &&
                  (doc2Analysis?.action_items || doc2.latestAnalysis?.action_items).length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {(doc2Analysis?.action_items || doc2.latestAnalysis?.action_items).map(
                      (item: string, idx: number) => (
                        <li key={idx} className="leading-snug">
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="text-slate-500 italic">No specific action items listed.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/60">
          <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 hover:bg-slate-800">
            Close Comparison
          </Button>
        </div>
      </div>
    </div>
  );
}
