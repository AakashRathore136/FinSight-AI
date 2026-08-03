import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import {
  SeniorPMLayout,
  CROLayout,
  JuniorAnalystLayout,
  ComplianceLayout,
} from "./dashboard/RoleLayouts";

type DashboardDocument = {
  id: string;
  status?: string;
  riskLevel?: string;
  createdAt?: any;
  latestAnalysis?: any;
};

function normalizeConfidence(value: any) {
  const n = Number(value || 0);
  if (n <= 1) return Math.round(n * 100 + Number.EPSILON);
  return Math.round(Math.min(100, n));
}

export function Dashboard({ user, userProfile, onAction, onDocSelect }: any) {
  let viewRole = userProfile?.role || "junior_analyst";
  const validRoles = ["junior_analyst", "senior_pm", "cro", "compliance"];
  if (!validRoles.includes(viewRole)) {
    viewRole = "junior_analyst";
  }

  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    highRisk: 0,
    avgConfidence: 0,
  });
  const [chartData, setChartData] = useState<any>({
    confidenceTrend: [],
    riskDistribution: [],
    entityExposure: [],
  });
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const docsQuery = query(
      collection(db, "documents"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(5),
    );

    const unsubscribe = onSnapshot(
      docsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as DashboardDocument,
        );
        setRecentDocs(docs);

        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "documents");
        setLoading(false);
      },
    );

    // Real aggregation for stats and charts
    const fetchStats = async () => {
      try {
        const allDocsQuery = query(
          collection(db, "documents"),
          where("ownerId", "==", user.uid),
        );
        const allDocs = await getDocs(allDocsQuery);
        const data = allDocs.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as DashboardDocument,
        );

        const getTimestamp = (dateVal: any) => {
          if (!dateVal) return Date.now();
          if (typeof dateVal === "number") return dateVal;
          if (typeof dateVal.toDate === "function")
            return dateVal.toDate().getTime();
          if (dateVal.seconds) return dateVal.seconds * 1000;
          const parsed = new Date(dateVal).getTime();
          return isNaN(parsed) ? Date.now() : parsed;
        };

        const completedDocs = data.filter((d: any) => d.status === "completed");
        let totalConfidenceValues: number[] = [];

        let confidenceTrend: any[] = [];
        let entitiesMap: Record<string, number> = {};

        // For each completed document, get its latest analysis from subcollection or doc field
        for (const doc of completedDocs) {
          try {
            let analysisData = doc.latestAnalysis;

            if (!analysisData) {
              const analysesQuery = query(
                collection(db, "documents", doc.id, "analyses"),
                orderBy("processedAt", "desc"),
                limit(1),
              );
              const analysesSnap = await getDocs(analysesQuery);
              if (!analysesSnap.empty) {
                analysisData = analysesSnap.docs[0].data();
              }
            }

            if (analysisData) {
              const raw =
                analysisData.sentiment_score ??
                analysisData.sentimentScore ??
                0;
              const confidence = normalizeConfidence(raw);
              totalConfidenceValues.push(confidence);

              // Build confidence trend
              const ts = getTimestamp(
                analysisData.processedAt || doc.createdAt,
              );

              // Only push if confidence > 0 to avoid zero-flatlines from missing data
              if (confidence > 0) {
                confidenceTrend.push({ confidence, timestamp: ts });
              }

              // Aggregate entities
              const entities = analysisData.entities || [];
              entities.forEach((e: string) => {
                entitiesMap[e] = (entitiesMap[e] || 0) + 1;
              });
            }
          } catch (err) {
            console.error("Failed to fetch analysis for doc:", doc.id, err);
          }
        }

        const avgConfidence = totalConfidenceValues.length
          ? Math.round(
              totalConfidenceValues.reduce((a, b) => a + b, 0) /
                totalConfidenceValues.length,
            )
          : 0;

        setStats({
          total: data.length,
          completed: completedDocs.length,
          pending: data.filter(
            (d: any) => d.status === "pending" || d.status === "processing",
          ).length,
          highRisk: data.filter((d: any) => d.riskLevel === "high").length,
          avgConfidence,
        });

        // Finalize chart data
        confidenceTrend.sort((a, b) => a.timestamp - b.timestamp);

        // Pass raw upload events for dynamic bucketing
        const uploadTrend = data
          .map((doc) => ({
            timestamp: getTimestamp(doc.createdAt),
            count: 1,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        const riskDistribution = [
          {
            name: "High",
            value: data.filter((d: any) => d.riskLevel === "high").length,
          },
          {
            name: "Medium",
            value: data.filter((d: any) => d.riskLevel === "medium").length,
          },
          {
            name: "Low",
            value: data.filter((d: any) => d.riskLevel === "low").length,
          },
        ].filter((r) => r.value > 0);

        const entityExposure = Object.entries(entitiesMap)
          .map(([sector, weight]) => ({
            sector,
            weight,
            risk: weight > 3 ? "High" : weight > 1 ? "Medium" : "Low",
          }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 8); // Top 8 entities

        setChartData({
          confidenceTrend,
          uploadTrend,
          riskDistribution,
          entityExposure,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "documents");
      }
    };
    fetchStats();

    return () => unsubscribe();
  }, [user]);

  const sharedProps = { recentDocs, stats, chartData, onAction, onDocSelect };

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Section */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none mb-1">
            {viewRole === "senior_pm" && "Portfolio Overview"}
            {viewRole === "cro" && "Enterprise Risk Summary"}
            {viewRole === "junior_analyst" &&
              `Good day, ${user.displayName?.split(" ")[0] || "Analyst"}`}
            {viewRole === "compliance" && "Compliance & Audit Hub"}
          </h1>
          <p className="text-slate-500 text-sm">
            {viewRole === "senior_pm" &&
              "Real-time VaR, drawdown, and asset class exposure."}
            {viewRole === "cro" &&
              "High-level risk intelligence and macro threshold monitoring."}
            {viewRole === "junior_analyst" &&
              "Review pending documents and validate AI extractions."}
            {viewRole === "compliance" &&
              "Monitor regulatory breaches and system access logs."}
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 uppercase">
          Live Data Feed Active{" "}
          <span className="inline-block w-2 h-2 ml-2 bg-emerald-500 rounded-full animate-pulse" />
        </div>
      </section>

      {/* Dynamic Role Layout Rendering */}
      {viewRole === "senior_pm" && <SeniorPMLayout {...sharedProps} />}
      {viewRole === "cro" && <CROLayout {...sharedProps} />}
      {viewRole === "junior_analyst" && (
        <JuniorAnalystLayout {...sharedProps} />
      )}
      {viewRole === "compliance" && <ComplianceLayout {...sharedProps} />}
    </div>
  );
}
