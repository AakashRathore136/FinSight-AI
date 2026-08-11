/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import {
  Plus,
  ShieldAlert,
  Award,
  CheckSquare,
} from "lucide-react";
import { MetricCard } from "./RiskMetrics";
import {
  DynamicTrendChart,
  RiskDistributionChart,
  EntityExposureHeatmap,
} from "./AdvancedCharts";
import { AlertCenter } from "./AlertCenter";
import { AuditTimeline } from "./AuditTimeline";

// Helper components passed from Dashboard
interface SharedProps {
  recentDocs: any[];
  stats: any;
  chartData: any;
  onAction: (action: string) => void;
  onDocSelect: (id: string) => void;
}

function RecentDocsTable({
  recentDocs,
  onDocSelect,
  onAction,
  title = "Recent Analyses",
}: any) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden">
      <CardHeader className="p-5 border-b border-slate-800 flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
          {title}
        </CardTitle>
        <Button
          variant="link"
          size="sm"
          onClick={() => onAction("documents")}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          View all
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto flex-1">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
            <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-800">
              <th className="px-5 py-3 font-bold">Document</th>
              <th className="px-5 py-3 font-bold text-center">Status</th>
              <th className="px-5 py-3 font-bold text-right">Risk</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-300">
            {recentDocs.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-5 py-8 text-center text-slate-500 italic text-xs"
                >
                  No recent activity.
                </td>
              </tr>
            ) : (
              recentDocs.map((doc: any) => (
                <tr
                  key={doc.id}
                  onClick={() => onDocSelect(doc.id)}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-white truncate max-w-[150px]">
                    {doc.fileName}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${doc.status === "completed" ? "bg-emerald-500" : doc.status === "processing" ? "bg-indigo-500 animate-pulse" : "bg-amber-500"}`}
                      />
                      <span className="text-xs capitalize">{doc.status}</span>
                    </div>
                  </td>
                  <td
                    className={`px-5 py-3 text-right text-xs font-mono font-bold ${doc.riskLevel === "high" ? "text-red-500" : doc.riskLevel === "medium" ? "text-amber-500" : "text-emerald-400"}`}
                  >
                    {doc.riskLevel || "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function renderTrendChart(chartData: any) {
  const hasConfidence =
    chartData?.confidenceTrend && chartData.confidenceTrend.length > 0;
  return hasConfidence ? (
    <DynamicTrendChart
      isLoading={!chartData}
      data={chartData.confidenceTrend}
    />
  ) : (
    <DynamicTrendChart
      isLoading={!chartData}
      data={chartData?.uploadTrend}
      title="Upload Volume Trend"
      dataKey="count"
      color="#10b981"
      valueSuffix=" docs"
    />
  );
}

/* ==========================================================================
   1. SENIOR PORTFOLIO MANAGER LAYOUT (High density, analytical, tactical widgets)
   ========================================================================== */
export function SeniorPMLayout({
  recentDocs,
  stats,
  chartData,
  onAction,
  onDocSelect,
}: SharedProps) {
  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Doc Intelligence"
          value={stats.completed}
          change="Live"
          changeType="positive"
          subtitle="Analyses processed"
        />
        <MetricCard
          title="AI Confidence"
          value={stats.hasConfidenceData ? `${stats.avgConfidence}%` : "N/A"}
          change="Average"
          changeType="neutral"
          subtitle={
            stats.hasConfidenceData
              ? "Extraction accuracy"
              : "No confidence data yet"
          }
        />
        <MetricCard
          title="High Risk Docs"
          value={stats.highRisk}
          change="Flagged"
          changeType="negative"
          subtitle="Pending review"
          alert={stats.highRisk > 0}
        />
        <MetricCard
          title="Total Docs Processed"
          value={stats.total}
          change="Archive"
          changeType="neutral"
          subtitle="Lifetime records"
        />
      </div>

      {/* Main Charts Area */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 h-[400px]">
        <div className="lg:col-span-2 xl:col-span-2">
          {renderTrendChart(chartData)}
        </div>
        <div className="lg:col-span-1 xl:col-span-1">
          <EntityExposureHeatmap
            isLoading={!chartData}
            data={chartData?.entityExposure}
          />
        </div>
        <div className="lg:col-span-3 xl:col-span-1">
          <AlertCenter recentDocs={recentDocs} maxItems={5} />
        </div>
      </div>

      {/* Bottom Area */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentDocsTable
            recentDocs={recentDocs}
            onDocSelect={onDocSelect}
            onAction={onAction}
            title="Recent Risk Assessments"
          />
        </div>
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-indigo-600 rounded-2xl p-6 shadow-xl shadow-indigo-900/20 text-white">
            <h3 className="font-bold mb-2 flex items-center gap-2 uppercase tracking-wider text-sm">
              <Plus size={16} /> Fast Analysis
            </h3>
            <p className="text-indigo-100 text-xs mb-4">
              Run ad-hoc NLP extraction on term sheets or filings.
            </p>
            <Button
              onClick={() => onAction("upload")}
              className="w-full bg-white text-indigo-900 hover:bg-slate-100 font-bold text-xs"
            >
              New Upload
            </Button>
          </div>
          <RiskDistributionChart
            isLoading={!chartData}
            data={chartData?.riskDistribution}
          />
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. CRO LAYOUT (High-level summary, executive oversight, top risks)
   ========================================================================== */
export function CROLayout({
  recentDocs,
  stats,
  chartData,
  onAction,
  onDocSelect,
}: SharedProps) {
  return (
    <div className="space-y-6">
      {/* High-level Strategic KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="System Risk Level"
          value={stats.highRisk > 0 ? "Elevated" : "Normal"}
          change={stats.highRisk > 0 ? "Action Required" : "Stable"}
          changeType={stats.highRisk > 0 ? "negative" : "positive"}
          subtitle="Current risk threshold status"
          alert={stats.highRisk > 0}
        />
        <MetricCard
          title="Awaiting Validation"
          value={stats.pending}
          subtitle="In validation pipeline"
        />
        <MetricCard
          title="Average AI Accuracy"
          value={stats.hasConfidenceData ? `${stats.avgConfidence}%` : "N/A"}
          subtitle={
            stats.hasConfidenceData
              ? "Extraction validation rate"
              : "No confidence data yet"
          }
        />
        <MetricCard
          title="Verified Portfolio size"
          value={`${stats.completed} Docs`}
          subtitle="Completed analyses"
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 h-[450px]">
        {/* Exposure Distribution */}
        <div className="lg:col-span-1">
          <RiskDistributionChart
            isLoading={!chartData}
            data={chartData?.riskDistribution}
          />
        </div>
        {/* Top Extracted Entity Exposure Map */}
        <div className="lg:col-span-1">
          <EntityExposureHeatmap
            isLoading={!chartData}
            data={chartData?.entityExposure}
          />
        </div>
        {/* Active Alert Escalations */}
        <div className="lg:col-span-1">
          <AlertCenter recentDocs={recentDocs} maxItems={6} />
        </div>
      </div>

      {/* CRO Strategic Board Panel */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentDocsTable
            recentDocs={recentDocs}
            onDocSelect={onDocSelect}
            onAction={onAction}
            title="Critical Legal Risk Assessments"
          />
        </div>
        <div className="lg:col-span-1">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2 text-rose-400">
                <ShieldAlert size={16} /> Board Action Required
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                You have {stats.highRisk} documents with active legal or
                financial breaches. Ensure that Compliance has successfully
                reviewed these alerts before the next quarterly risk board
                meeting.
              </p>
            </div>
            <Button
              onClick={() => onAction("documents")}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider"
            >
              Verify Breaches
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. JUNIOR ANALYST LAYOUT (Guided workflow, simple metrics, checklists)
   ========================================================================== */
export function JuniorAnalystLayout({
  recentDocs,
  stats,
  chartData,
  onAction,
  onDocSelect,
}: SharedProps) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Dynamic Analyst Guided Alert */}
      <div className="bg-slate-900 border border-indigo-500/30 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Award className="text-indigo-400" size={20} /> Welcome back,
            Analyst
          </h2>
          <p className="text-slate-400 text-sm">
            {stats.pending > 0
              ? `You currently have ${stats.pending} files awaiting audit in your review queue.`
              : "All files are up to date! Great job maintaining policy compliance."}
          </p>
        </div>
        <Button
          onClick={() => onAction("upload")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
        >
          <Plus className="mr-2" size={16} /> Process New Document
        </Button>
      </div>

      {/* Simplified metric cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="My Pending Reviews"
          value={stats.pending}
          subtitle="Waiting for manual validation"
        />
        <MetricCard
          title="AI Confidence Rate"
          value={stats.hasConfidenceData ? `${stats.avgConfidence}%` : "N/A"}
          subtitle={
            stats.hasConfidenceData
              ? "Confidence average score"
              : "No confidence data yet"
          }
          changeType="positive"
        />
        <MetricCard
          title="My Completed Reviews"
          value={stats.completed}
          subtitle="Finished this session"
        />
        <MetricCard
          title="Risk Escaped Flags"
          value={stats.highRisk}
          subtitle="Total policy breaches found"
          alert={stats.highRisk > 0}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Analyst Checklist */}
        <div className="lg:col-span-1">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 h-full flex flex-col">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckSquare size={16} className="text-indigo-400" />
              Ingestion Checklist
            </h3>
            <ul className="space-y-4 text-xs text-slate-300 flex-1">
              <li className="flex gap-2.5 items-start">
                <span className="h-4 w-4 bg-emerald-500/20 text-emerald-400 rounded flex items-center justify-center font-bold text-[10px] shrink-0">
                  ✓
                </span>
                <div>
                  <p className="font-semibold text-slate-200">
                    Ingest Document Archive
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Upload a PDF filing or contract.
                  </p>
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span
                  className={`h-4 w-4 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${stats.completed > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-850 text-slate-600"}`}
                >
                  {stats.completed > 0 ? "✓" : "2"}
                </span>
                <div>
                  <p className="font-semibold text-slate-200">
                    Validate AI Extraction
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Open completed files to verify key metadata.
                  </p>
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span
                  className={`h-4 w-4 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${stats.highRisk > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-850 text-slate-600"}`}
                >
                  {stats.highRisk > 0 ? "✓" : "3"}
                </span>
                <div>
                  <p className="font-semibold text-slate-200">
                    Acknowledge Policy Breaches
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Acknowledge critical alerts in the system.
                  </p>
                </div>
              </li>
            </ul>
          </Card>
        </div>

        {/* Dynamic Trend Chart */}
        <div className="lg:col-span-2 h-[400px]">
          {renderTrendChart(chartData)}
        </div>
      </div>

      <div className="h-[400px]">
        <RecentDocsTable
          recentDocs={recentDocs}
          onDocSelect={onDocSelect}
          onAction={onAction}
          title="My Active Auditing Queue"
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   4. COMPLIANCE LAYOUT (Audit trails, timelines, regulatory controls)
   ========================================================================== */
export function ComplianceLayout({
  recentDocs,
  stats,
  chartData,
  onAction,
  onDocSelect,
}: SharedProps) {
  return (
    <div className="space-y-6">
      {/* Compliance metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Critical Policy Breaches"
          value={stats.highRisk}
          changeType={stats.highRisk > 0 ? "negative" : "neutral"}
          subtitle="Flagged Documents"
          alert={stats.highRisk > 0}
        />
        <MetricCard
          title="Archived Risk Index"
          value={stats.total}
          subtitle="Lifetime validated files"
        />
        <MetricCard
          title="Pipeline Queue"
          value={stats.pending}
          subtitle="Currently auditing"
        />
        <MetricCard
          title="System Compliance score"
          value="98.2%"
          change="Audit-ready"
          changeType="positive"
          subtitle="Average audit completion rate"
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Real Regulatory Audit Timeline */}
        <div className="h-[500px]">
          <AuditTimeline recentDocs={recentDocs} />
        </div>

        {/* Compliance Documents Archive */}
        <div className="h-[500px]">
          <RecentDocsTable
            recentDocs={recentDocs}
            onDocSelect={onDocSelect}
            onAction={onAction}
            title="Compliance Document Archive"
          />
        </div>
      </div>
    </div>
  );
}
