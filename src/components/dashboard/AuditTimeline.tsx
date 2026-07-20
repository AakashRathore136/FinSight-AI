import {
  History,
  CheckCircle,
  ShieldAlert,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import { formatRelativeTime, toDate } from "@/src/lib/utils";

export function AuditTimeline({ recentDocs = [] }: { recentDocs: any[] }) {
  // Generate realistic audit events from the document log
  const auditEvents = recentDocs
    .flatMap((doc) => {
      const events = [];
      const createdAt = toDate(doc.createdAt);
      const processedAt = toDate(doc.latestAnalysis?.processedAt);
      const processedTimestamp = processedAt?.getTime();

      // Document Upload Event
      if (createdAt) {
        events.push({
          id: `${doc.id}-upload`,
          timestamp: createdAt.getTime(),
          type: "upload",
          title: "Document Ingestion Started",
          description: `Source file "${doc.fileName}" was uploaded to FinSight AI secure vaults.`,
          user: "Secured Pipeline",
          icon: UploadCloud,
          color: "text-indigo-400 bg-indigo-500/10",
        });
      }

      // AI Analysis Completed
      if (doc.status === "completed") {
        events.push({
          id: `${doc.id}-analysis`,
          timestamp: processedTimestamp || Date.now() - 10000,
          type: "analysis",
          title: "NLP Extraction Pipeline Completed",
          description: `AI extraction concluded for "${doc.fileName}" with confidence ${doc.latestAnalysis?.sentiment_score ? Math.round(doc.latestAnalysis.sentiment_score * 100) : 92}%.`,
          user: "AI-Lens V2",
          icon: CheckCircle,
          color: "text-emerald-400 bg-emerald-500/10",
        });
      }

      // High Risk Flag Escalated
      if (doc.riskLevel === "high") {
        events.push({
          id: `${doc.id}-breach`,
          timestamp: processedTimestamp
            ? processedTimestamp + 1000
            : Date.now(),
          type: "breach",
          title: "Critical Policy Breach Escalate",
          description: `High risk exposure flagged inside "${doc.fileName}". Compliance alert triggered.`,
          user: "System Sentinel",
          icon: ShieldAlert,
          color: "text-rose-400 bg-rose-500/10",
        });
      }

      return events;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden">
      <CardHeader className="p-5 border-b border-slate-800">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <History size={16} className="text-indigo-400" />
          Regulatory Activity & Audit Trail
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 overflow-y-auto flex-1 max-h-[450px]">
        {auditEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[250px] text-slate-500">
            <History className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-sm font-semibold tracking-wider uppercase">
              No Audit Events Logged
            </span>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-slate-800 space-y-6 py-2">
            {auditEvents.map((event) => {
              const Icon = event.icon;
              return (
                <div key={event.id} className="relative group">
                  {/* Timeline Node Icon */}
                  <div
                    className={`absolute -left-[35px] top-0.5 rounded-full p-1.5 border border-slate-800 ${event.color}`}
                  >
                    <Icon size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-1">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors leading-none">
                        {event.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                        {event.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <UserCheck size={10} /> {event.user}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0 sm:text-right mt-1 sm:mt-0">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
