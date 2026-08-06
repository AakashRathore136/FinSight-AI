import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Progress } from "@/src/components/ui/progress";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  RefreshCw,
  Repeat,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Filter,
  DollarSign,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { requestNotificationPermission } from "@/src/pwa/registerSW";
import { SubscriptionCard } from "./SubscriptionCard";
import {
  fetchUserTransactions,
  fetchUserSubscriptions,
  detectAndSaveSubscriptions,
  generateSubscriptionSummary,
  Subscription,
} from "@/src/lib/subscriptionUtils";

const FREQUENCY_FILTERS = [
  { value: "all", label: "All" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
];

export function SubscriptionAnalyzer({ user }: { user: any }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      loadSubscriptions();
    }
  }, [user?.uid]);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const subs = await fetchUserSubscriptions(user.uid);
      setSubscriptions(subs);
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const transactions = await fetchUserTransactions(user.uid, 365);
      if (transactions.length < 10) {
        toast.error(
          "Not enough transaction history to analyze. Upload or add more transactions.",
        );
        return;
      }
      const newSubs = await detectAndSaveSubscriptions(user.uid, transactions);
      if (newSubs.length === 0) {
        toast.info("No new recurring subscriptions detected");
      } else {
        toast.success(
          `Detected ${newSubs.length} new subscription${newSubs.length > 1 ? "s" : ""}`,
        );
      }
      await loadSubscriptions();
    } catch (error) {
      console.error("Error analyzing subscriptions:", error);
      toast.error("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const summary = useMemo(() => {
    return generateSubscriptionSummary(subscriptions);
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    let result = subscriptions;

    if (filter !== "all") {
      result = result.filter((s) => s.frequency === filter);
    }

    if (showUpcomingOnly) {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);
      result = result.filter((s) => {
        const renewal = new Date(s.nextRenewalDate);
        return s.isActive && renewal >= now && renewal <= thirtyDaysFromNow;
      });
    }

    return result.sort(
      (a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime(),
    );
  }, [subscriptions, filter, showUpcomingOnly]);

  const categoryEntries = Object.entries(summary.categoryGroups).sort(
    (a, b) => b[1].yearly - a[1].yearly,
  );

  const FREQUENCY_COLORS: Record<string, string> = {
    monthly: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    yearly: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    weekly: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Subscription Analyzer
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium uppercase tracking-wider">
            Auto-detect recurring expenses & forecast renewals
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={async () => {
              const perm = await requestNotificationPermission();
              if (perm === 'granted') {
                toast.success("Push notifications enabled!");
              } else {
                toast.error("Notifications were denied.");
              }
            }}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm uppercase tracking-widest rounded-2xl h-12 px-4"
          >
            <Bell className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={analyzing || loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm uppercase tracking-widest shadow-xl shadow-indigo-900/40 rounded-2xl h-12 px-6"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${analyzing ? "animate-spin" : ""}`}
            />
            {analyzing ? "Analyzing..." : "Scan Transactions"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-indigo-900/40 bg-indigo-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Monthly Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <DollarSign className="h-5 w-5 text-indigo-400" />
                  <span className="text-3xl font-black text-white">
                    ${summary.totalMonthly.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Recurring per month
                </p>
              </CardContent>
            </Card>

            <Card className="border-indigo-900/40 bg-indigo-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Annual Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <span className="text-3xl font-black text-white">
                    ${summary.totalYearly.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Total yearly burn
                </p>
                <div className="mt-3">
                  <Progress
                    value={Math.min(
                      (summary.totalYearly / 60000) * 100,
                      100,
                    )}
                    className="h-1.5 bg-slate-800"
                  >
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.min((summary.totalYearly / 60000) * 100, 100)}%`,
                      }}
                    />
                  </Progress>
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-900/40 bg-indigo-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Active Subscriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <Repeat className="h-5 w-5 text-purple-400" />
                  <span className="text-3xl font-black text-white">
                    {summary.activeCount}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Services tracked
                </p>
              </CardContent>
            </Card>

            <Card className="border-indigo-900/40 bg-indigo-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Subscription Burden
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">
                    {isNaN(summary.subscriptionBurden) ? 0 : summary.subscriptionBurden}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  of monthly income
                </p>
                {summary.subscriptionBurden > 20 && (
                  <div className="flex items-center gap-1 mt-2 text-red-400 text-xs font-bold">
                    <AlertTriangle className="h-3 w-3" />
                    High burden
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {summary.upcomingRenewals.length > 0 && (
            <Card className="border-amber-900/30 bg-amber-950/10">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  <CardTitle className="text-white text-base font-bold">
                    Upcoming Renewals (Next 30 Days)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {summary.upcomingRenewals.map((sub) => (
                    <div
                      key={sub.id}
                      className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-white font-bold text-sm">
                          {sub.name}
                        </p>
                        <p className="text-amber-400 font-mono text-xs mt-1">
                          ${sub.amount.toFixed(2)} on{" "}
                          {format(sub.nextRenewalDate, "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-amber-600/50 text-amber-300 text-[10px] font-bold uppercase tracking-wider"
                      >
                        {sub.frequency}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-xl font-black text-white tracking-tight">
                Your Subscriptions
                <span className="text-slate-500 text-sm font-medium ml-3">
                  ({filteredSubscriptions.length}{" "}
                  {filteredSubscriptions.length === 1 ? "service" : "services"})
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                  {FREQUENCY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        filter === f.value
                          ? "bg-indigo-600 text-white shadow-lg"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant={showUpcomingOnly ? "default" : "outline"}
                  onClick={() => setShowUpcomingOnly(!showUpcomingOnly)}
                  className={`h-9 text-xs font-bold uppercase tracking-wider rounded-xl ${
                    showUpcomingOnly
                      ? "bg-indigo-600 text-white"
                      : "border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  Upcoming
                </Button>
              </div>
            </div>

            {filteredSubscriptions.length === 0 ? (
              <Card className="border-dashed border-slate-800 bg-slate-900/50">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Repeat className="h-12 w-12 text-slate-600 mb-4" />
                  <p className="text-slate-400 font-bold text-lg">
                    No subscriptions found
                  </p>
                  <p className="text-slate-500 text-sm mt-2 max-w-md">
                    Click "Scan Transactions" to automatically detect recurring
                    subscriptions from your transaction history.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredSubscriptions.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      subscription={sub}
                      onUpdate={loadSubscriptions}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {categoryEntries.length > 0 && (
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-white text-base font-bold">
                  Category Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryEntries.map(([category, data]) => {
                    const percentage =
                      summary.totalYearly > 0
                        ? (data.yearly / summary.totalYearly) * 100
                        : 0;
                    return (
                      <div key={category} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-white font-semibold text-sm capitalize">
                              {category}
                            </span>
                            <Badge
                              variant="secondary"
                              className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] font-bold"
                            >
                              {data.count}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <span className="text-indigo-400 font-mono text-sm font-bold">
                              ${data.yearly.toFixed(2)}
                            </span>
                            <span className="text-slate-500 text-xs ml-2">
                              /yr
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={percentage}
                          className="h-2 bg-slate-800"
                        >
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </Progress>
                        <div className="text-right">
                          <span className="text-slate-500 text-xs font-medium">
                            ${data.monthly.toFixed(2)}/mo
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
}

// Ensures format is available for nextRenewalDate

