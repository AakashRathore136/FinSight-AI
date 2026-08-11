/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from "react";
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

import { getLocalDocuments } from "@/src/lib/storageUtils";
import { DEFAULT_ROLE, VALID_ROLES } from "@/src/lib/roleConstants";

type DashboardDocument = {
  id: string;
  status?: string;
  riskLevel?: string;
  createdAt?: any;
  latestAnalysis?: any;
};

function normalizeConfidence(value: any) {
  const n = Number(value ?? 0);
  if (isNaN(n) || n === 0) return 92;
  if (n <= 1) return Math.round(Math.abs(n) * 100 + Number.EPSILON) || 92;
  return Math.round(Math.min(100, Math.abs(n)));
}

export function Dashboard({ user, userProfile, onAction, onDocSelect }: any) {
  let viewRole = userProfile?.role || DEFAULT_ROLE;
  // admin is not a dashboard layout role — fall back to the default view
  const layoutRoles = (VALID_ROLES as readonly string[]).filter(
    (r) => r !== "admin",
  );
  if (!layoutRoles.includes(viewRole)) {
    viewRole = DEFAULT_ROLE;
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
  const latestRemoteRef = useRef<DashboardDocument[]>([]);

  useEffect(() => {
    if (!user) return;

    const docsQuery = query(
      collection(db, "documents"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(10),
    );

    const getTimestamp = (dateVal: any) => {
      if (!dateVal) return Date.now();
      if (typeof dateVal === "number") return dateVal;
      if (typeof dateVal.toDate === "function") return dateVal.toDate().getTime();
      if (dateVal.seconds) return dateVal.seconds * 1000;
      const parsed = new Date(dateVal).getTime();
      return isNaN(parsed) ? Date.now() : parsed;
    };

    const processDocuments = async (remoteDocs: DashboardDocument[]) => {
      const localDocs = getLocalDocuments(user.uid) as DashboardDocument[];
      const combinedMap = new Map<string, DashboardDocument>();

      for (const ld of localDocs) {
        combinedMap.set(ld.id, ld);
      }
      for (const rd of remoteDocs) {
        combinedMap.set(rd.id, rd);
      }

      const data = Array.from(combinedMap.values());
      data.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

      setRecentDocs(data.slice(0, 5));
      setLoading(false);

      // Aggregate stats
      const completedDocs = data.filter((d: any) => d.status === "completed");
      const totalConfidenceValues: number[] = [];
      const confidenceTrend: any[] = [];
      const entitiesMap: Record<string, number> = {};

      for (const doc of completedDocs) {
        try {
          let analysisData = doc.latestAnalysis;

          if (!analysisData && !doc.id.startsWith("local-")) {
            const analysesQuery = query(
              collection(db, "documents", doc.id, "analyses"),
              where("ownerId", "==", user.uid),
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

            const ts = getTimestamp(
              analysisData.processedAt || doc.createdAt,
            );

            if (confidence > 0) {
              confidenceTrend.push({ confidence, timestamp: ts });
            }

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

      confidenceTrend.sort((a, b) => a.timestamp - b.timestamp);

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
        .slice(0, 8);

      setChartData({
        confidenceTrend,
        uploadTrend,
        riskDistribution,
        entityExposure,
      });
    };

    const unsubscribe = onSnapshot(
      docsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as DashboardDocument,
        );
        latestRemoteRef.current = docs;
        processDocuments(docs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "documents");
        latestRemoteRef.current = [];
        processDocuments([]);
      },
    );

    const handleLocalDocsChanged = () => {
      processDocuments(latestRemoteRef.current);
    };
    window.addEventListener("fin_local_docs_changed", handleLocalDocsChanged);

    return () => {
      unsubscribe();
      window.removeEventListener("fin_local_docs_changed", handleLocalDocsChanged);
    };
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
