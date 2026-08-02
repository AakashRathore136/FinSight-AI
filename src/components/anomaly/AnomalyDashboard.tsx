import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import {
  fetchUserTransactions,
  calculateCategoryBaseline,
  detectLargeTransactions,
  detectCategorySpikes,
  calculateConfidenceScore,
  checkHistoricalSimilarAnomalies,
  Anomaly,
  Transaction,
} from "@/src/lib/anomalyUtils";
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
import { Skeleton } from "@/src/components/ui/skeleton";
import { AlertTriangle, RefreshCw, BarChart3, DollarSign } from "lucide-react";
import { AnomalyCard } from "@/src/components/anomaly/AnomalyCard";
import { formatDateSafe } from "@/src/lib/utils";

interface AnomalyDashboardProps {
  user: { uid: string; [key: string]: any } | null;
}

type AnomalyWithHistory = Anomaly & {
  historicalCount: number;
  historicalLabel?: string;
};

export function AnomalyDashboard({ user }: AnomalyDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyWithHistory[]>([]);
  const [largeTxCount, setLargeTxCount] = useState(0);
  const [spikeCount, setSpikeCount] = useState(0);
  const [totalAnomalyAmount, setTotalAnomalyAmount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const anomaliesQuery = query(
      collection(db, "anomalies"),
      where("userId", "==", user.uid),
      where("dismissed", "==", false),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      anomaliesQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          historicalCount: d.data().historicalCount || 0,
          historicalLabel: d.data().historicalLabel,
          ...d.data(),
        })) as AnomalyWithHistory[];
        setAnomalies(docs);
        setLargeTxCount(
          docs.filter((a) => a.type === "large_transaction").length,
        );
        setSpikeCount(docs.filter((a) => a.type === "category_spike").length);
        setTotalAnomalyAmount(docs.reduce((sum, a) => sum + a.amount, 0));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "anomalies");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const refreshAnomalies = async () => {
    if (!user?.uid || refreshing) return;
    setRefreshing(true);
    try {
      await runDetection(user.uid);
    } catch (error) {
      console.error("Detection error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    let mounted = true;

    const init = async () => {
      await runDetection(user.uid);
      if (!mounted) return;

      const existingQuery = query(
        collection(db, "anomalies"),
        where("userId", "==", user.uid),
        where("dismissed", "==", false),
        limit(1),
      );
      const existingSnap = await getDocs(existingQuery);
      if (existingSnap.empty) {
        await runDetection(user.uid);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  const handleDismiss = async (anomalyId: string) => {
    try {
      const ref = doc(db, "anomalies", anomalyId);
      await updateDoc(ref, {
        dismissed: true,
        dismissedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `anomalies/${anomalyId}`,
      );
    }
  };

  const largeTransactions = anomalies.filter(
    (a) => a.type === "large_transaction",
  );
  const categorySpikes = anomalies.filter((a) => a.type === "category_spike");
  const weeklyAnomalies = groupByWeek(anomalies);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 bg-slate-800" />
            <Skeleton className="h-4 w-96 bg-slate-800 mt-2" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 bg-slate-800 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none mb-1">
            Anomaly Detection
          </h1>
          <p className="text-slate-500 text-sm">
            Statistically significant deviations from your spending patterns.
          </p>
        </div>
        <Button
          onClick={refreshAnomalies}
          disabled={refreshing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest h-10 px-4 rounded-xl shadow-lg shadow-indigo-900/20"
        >
          <RefreshCw
            size={16}
            className={`mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Scanning..." : "Rescan"}
        </Button>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard
          title="Large Transactions"
          value={largeTxCount}
          icon={<AlertTriangle size={18} />}
          color="text-red-400"
          bg="bg-red-500/10"
        />
        <StatCard
          title="Category Spikes"
          value={spikeCount}
          icon={<BarChart3 size={18} />}
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
        <StatCard
          title="Total Anomaly Value"
          value={`$${totalAnomalyAmount.toLocaleString()}`}
          icon={<DollarSign size={18} />}
          color="text-indigo-400"
          bg="bg-indigo-500/10"
        />
      </div>

      {anomalies.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <p className="text-slate-400 font-medium">No anomalies detected</p>
            <p className="text-xs text-slate-500">
              Your spending patterns appear normal based on the last 3 months of
              data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {largeTransactions.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-400">
                  Large Transaction Alerts
                </h2>
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] font-black uppercase tracking-widest">
                  {largeTransactions.length}
                </Badge>
              </div>
              <div className="grid gap-4">
                {largeTransactions.map((anomaly) => (
                  <AnomalyCard
                    key={anomaly.id}
                    anomaly={anomaly}
                    onDismiss={handleDismiss}
                    historicalCount={anomaly.historicalCount}
                    historicalLabel={anomaly.historicalLabel}
                  />
                ))}
              </div>
            </section>
          )}

          {categorySpikes.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-400">
                  Unusual Category Spikes
                </h2>
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-black uppercase tracking-widest">
                  {categorySpikes.length}
                </Badge>
              </div>
              <div className="grid gap-4">
                {categorySpikes.map((anomaly) => (
                  <AnomalyCard
                    key={anomaly.id}
                    anomaly={anomaly}
                    onDismiss={handleDismiss}
                    historicalCount={anomaly.historicalCount}
                    historicalLabel={anomaly.historicalLabel}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">
              Weekly Anomaly Summary
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {weeklyAnomalies.map((week) => (
                <Card
                  key={week.label}
                  className="bg-slate-900 border-slate-800 rounded-xl"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {week.label}
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                      {week.count} {week.count === 1 ? "anomaly" : "anomalies"}{" "}
                      detected
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Total Value</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        ${week.totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Avg Confidence</span>
                      <span className="font-mono font-bold text-white">
                        {Math.round(week.avgConfidence)}%
                      </span>
                    </div>
                    <Progress value={week.avgConfidence} className="h-1">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${week.avgConfidence}%` }}
                      />
                    </Progress>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {week.types.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[9px] font-black uppercase tracking-widest border-slate-700 text-slate-400"
                        >
                          {t.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

async function runDetection(userId: string) {
  const transactions = await fetchUserTransactions(userId, 3);
  if (transactions.length === 0) return;

  const baseline = calculateCategoryBaseline(transactions);
  const largeTxAnomalies = detectLargeTransactions(transactions, baseline);
  const categorySpikeAnomalies = detectCategorySpikes(transactions, baseline);

  const newAnomalies: Omit<Anomaly, "id">[] = [];

  largeTxAnomalies.forEach((tx) => {
    const catBaseline = baseline.get(tx.category)!;
    const confidence = calculateConfidenceScore(
      "large_transaction",
      tx.amount,
      catBaseline.mean,
      catBaseline.stdDev,
    );
    newAnomalies.push({
      userId,
      type: "large_transaction",
      category: tx.category,
      amount: tx.amount,
      description: `Transaction of $${tx.amount.toLocaleString()} in ${tx.category} exceeds the category average by more than 2 standard deviations.`,
      confidence,
      transactionId: tx.id,
      dismissed: false,
      createdAt: tx.date,
    });
  });

  categorySpikeAnomalies.forEach((spike) => {
    const confidence = calculateConfidenceScore(
      "category_spike",
      spike.amount,
      spike.baseline.mean,
      spike.baseline.stdDev,
    );
    const lastMonthTotal =
      spike.baseline.monthlyTotals[spike.baseline.monthlyTotals.length - 1];
    const avgMonthly =
      spike.baseline.monthlyTotals.reduce((a, b) => a + b, 0) /
      spike.baseline.monthlyTotals.length;
    const pctOver =
      avgMonthly > 0 ? Math.round((lastMonthTotal / avgMonthly - 1) * 100) : 0;

    newAnomalies.push({
      userId,
      type: "category_spike",
      category: spike.category,
      amount: spike.amount,
      description: `${spike.category} spending is ${pctOver}% above the 3-month average.`,
      confidence,
      transactionId:
        spike.transactions[spike.transactions.length - 1]?.id || "",
      dismissed: false,
      createdAt:
        spike.transactions[spike.transactions.length - 1]?.date ||
        new Date().toISOString(),
    });
  });

  for (const anomaly of newAnomalies) {
    try {
      const existingQuery = query(
        collection(db, "anomalies"),
        where("userId", "==", userId),
        where("transactionId", "==", anomaly.transactionId),
        where("type", "==", anomaly.type),
        where("dismissed", "==", false),
      );
      const existingSnap = await getDocs(existingQuery);
      if (existingSnap.empty) {
        const historical = await checkHistoricalSimilarAnomalies(
          userId,
          anomaly.category,
          anomaly.type,
          anomaly.amount,
        );
        await addDoc(collection(db, "anomalies"), {
          ...anomaly,
          historicalCount: historical.count,
          historicalLabel: historical.label,
          createdAt: anomaly.createdAt || serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Failed to save anomaly:", error);
    }
  }
}

function groupByWeek(anomalies: Anomaly[]): Array<{
  label: string;
  count: number;
  totalAmount: number;
  avgConfidence: number;
  types: string[];
}> {
  const weeks = new Map<string, Anomaly[]>();

  anomalies.forEach((a) => {
    const date = toDate(a.createdAt);
    if (!date) return;
    const key = getWeekKey(date);
    const arr = weeks.get(key) || [];
    arr.push(a);
    weeks.set(key, arr);
  });

  return Array.from(weeks.entries())
    .map(([label, items]) => ({
      label,
      count: items.length,
      totalAmount: items.reduce((sum, a) => sum + a.amount, 0),
      avgConfidence:
        items.reduce((sum, a) => sum + (a.confidence || 0), 0) / items.length,
      types: Array.from(new Set(items.map((a) => a.type))),
    }))
    .sort((a, b) => b.label.localeCompare(a.label));
}

function getWeekKey(date: Date): string {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateSafe(start, { month: "short", day: "numeric" })} - ${formatDateSafe(end, { month: "short", day: "numeric" })}`;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function StatCard({
  title,
  value,
  icon,
  color,
  bg,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl">
      <CardContent className="p-6 flex items-center gap-5">
        <div
          className={`h-12 w-12 rounded-xl ${bg} ${color} flex items-center justify-center shadow-inner`}
        >
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          <p className="text-2xl font-bold text-white tabular-nums mt-0.5">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
