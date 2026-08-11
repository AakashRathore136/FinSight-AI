/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import { auth } from "@/src/lib/firebase";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import {
  AlertTriangle,
  Info,
  Bell,
  Activity,
  CheckCircle,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { RiskBadge } from "./RiskMetrics";
import { formatRelativeTime } from "@/src/lib/utils";

export function AlertCenter({
  recentDocs = [],
  maxItems = 4,
}: {
  recentDocs?: any[];
  maxItems?: number;
}) {
  // Use state to persist manual acknowledgements / comments in local session
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<
    Record<string, boolean>
  >({});
  const [escalatedAlerts, setEscalatedAlerts] = useState<
    Record<string, boolean>
  >({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const hasLoadedActions = useRef(false);
  const storageKey = `finsight-alert-actions:${auth.currentUser?.uid || "anonymous"}`;

  useEffect(() => {
    try {
      const savedActions = localStorage.getItem(storageKey);
      if (!savedActions) return;

      const { acknowledgedAlerts, escalatedAlerts, comments } = JSON.parse(savedActions);
      setAcknowledgedAlerts(acknowledgedAlerts || {});
      setEscalatedAlerts(escalatedAlerts || {});
      setComments(comments || {});
    } catch (error) {
      console.error("Failed to load saved alert actions:", error);
    } finally {
      hasLoadedActions.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hasLoadedActions.current) return;

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ acknowledgedAlerts, escalatedAlerts, comments }),
      );
    } catch (error) {
      console.error("Failed to save alert actions:", error);
    }
  }, [acknowledgedAlerts, escalatedAlerts, comments, storageKey]);

  // Derive real alerts from actual document data
  const derivedAlerts = recentDocs
    .filter(
      (doc) =>
        doc.riskLevel === "high" ||
        doc.riskLevel === "medium" ||
        doc.status === "processing",
    )
    .map((doc) => {
      let type = "info";
      let desc = "";
      if (doc.riskLevel === "high") {
        type = "critical";
        desc = `AI extracted high risk factors in ${doc.fileName}. Immediate review required.`;
      } else if (doc.riskLevel === "medium") {
        type = "warning";
        desc = `AI identified potential medium risk factors in ${doc.fileName}.`;
      } else if (doc.status === "processing") {
        type = "info";
        desc = `AI analysis is currently running for ${doc.fileName}.`;
      }

      return {
        id: doc.id,
        type,
        title: doc.fileName,
        time: formatRelativeTime(doc.createdAt, "Just now"),
        desc,
        level: doc.riskLevel || "Pending",
      };
    })
    .slice(0, maxItems);

  const handleAcknowledge = (id: string) => {
    setAcknowledgedAlerts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleEscalate = (id: string) => {
    setEscalatedAlerts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAddComment = (id: string) => {
    if (!commentInput.trim()) return;
    setComments((prev) => ({
      ...prev,
      [id]: commentInput,
    }));
    setCommentInput("");
    setActiveCommentId(null);
  };

  const unresolvedCount = derivedAlerts.filter(
    (a) => !acknowledgedAlerts[a.id],
  ).length;

  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden flex flex-col h-full">
      <CardHeader className="p-5 border-b border-slate-800 flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Bell
            size={16}
            className={
              unresolvedCount > 0 ? "text-amber-500" : "text-slate-500"
            }
          />
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
            System Alerts & Breaches
          </CardTitle>
        </div>
        {unresolvedCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-400 animate-pulse">
            {unresolvedCount}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {derivedAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-slate-500">
            <Activity className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-sm font-semibold tracking-wider uppercase">
              No Critical Alerts
            </span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-800/50">
            {derivedAlerts.map((alert) => {
              const isAck = acknowledgedAlerts[alert.id];
              const isEsc = escalatedAlerts[alert.id];
              const hasComment = comments[alert.id];

              return (
                <div
                  key={alert.id}
                  className={`p-4 transition-all duration-300 relative group ${
                    isAck
                      ? "opacity-40 bg-slate-900/40"
                      : "hover:bg-slate-800/30"
                  }`}
                >
                  {/* Alert Header */}
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      {isAck ? (
                        <CheckCircle size={14} className="text-emerald-500" />
                      ) : isEsc ? (
                        <ShieldAlert
                          size={14}
                          className="text-rose-500 animate-bounce"
                        />
                      ) : (
                        <>
                          {alert.type === "critical" && (
                            <AlertTriangle size={14} className="text-red-500" />
                          )}
                          {alert.type === "warning" && (
                            <Activity size={14} className="text-amber-500" />
                          )}
                          {alert.type === "info" && (
                            <Info size={14} className="text-blue-500" />
                          )}
                        </>
                      )}
                      <span
                        className={`text-sm font-bold truncate max-w-[150px] ${
                          isAck
                            ? "text-slate-500 line-through"
                            : "text-slate-200 group-hover:text-indigo-400 transition-colors"
                        }`}
                      >
                        {alert.title}
                      </span>
                      {isEsc && !isAck && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-rose-400 bg-rose-500/10 px-1 rounded">
                          Escalated
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {alert.time}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mt-1 pl-6 line-clamp-2 leading-relaxed">
                    {alert.desc}
                  </p>

                  {/* Comment Feed */}
                  {hasComment && (
                    <div className="mt-2 ml-6 p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-start gap-1.5">
                      <MessageSquare
                        size={12}
                        className="text-indigo-400 shrink-0 mt-0.5"
                      />
                      <span className="italic">" {comments[alert.id]} "</span>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="mt-3 pl-6 flex items-center justify-between gap-2 flex-wrap">
                    <RiskBadge level={alert.level} />

                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                          isAck
                            ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                            : "bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white"
                        }`}
                      >
                        {isAck ? "Re-open" : "Acknowledge"}
                      </button>

                      {!isAck && (
                        <>
                          <button
                            onClick={() => handleEscalate(alert.id)}
                            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                              isEsc
                                ? "bg-rose-600/20 text-rose-400 hover:bg-slate-800"
                                : "bg-rose-600/10 text-rose-400 hover:bg-rose-600 hover:text-white"
                            }`}
                          >
                            {isEsc ? "De-escalate" : "Escalate"}
                          </button>

                          <button
                            onClick={() => {
                              setActiveCommentId(
                                activeCommentId === alert.id ? null : alert.id,
                              );
                              setCommentInput(comments[alert.id] || "");
                            }}
                            className="text-[10px] font-bold px-2 py-1 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded transition-colors"
                          >
                            Comment
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Comment Input Modal / Drawer */}
                  {activeCommentId === alert.id && (
                    <div className="mt-2.5 ml-6 flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Add escalation/audit comment..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddComment(alert.id);
                        }}
                      />
                      <button
                        onClick={() => handleAddComment(alert.id)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded text-xs"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
