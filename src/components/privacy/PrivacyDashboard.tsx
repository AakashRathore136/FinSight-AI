import { useState, useEffect } from "react";
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
import { Input } from "@/src/components/ui/input";
import {
  ShieldCheck,
  Loader2,
  Download,
  Trash2,
  LogOut,
  Globe,
  Lock,
  Eye,
  Activity,
} from "lucide-react";
import SessionManager from "@/src/components/privacy/SessionManager";
import {
  exportUserData,
  deleteUserData,
  fetchActivityLog,
  revokeUserSessions,
  PrivacySettings,
  ActivityLogEntry,
} from "@/src/lib/privacyUtils";
import { toast } from "sonner";

export function PrivacyDashboard({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [privacySettings, setPrivacySettings] =
    useState<PrivacySettings | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPrivacyData();
  }, [user]);

  async function loadPrivacyData() {
    if (!user) return;
    setLoading(true);
    try {
      const logs = await fetchActivityLog(user.uid);
      setActivityLog(logs);
      setPrivacySettings({
        userId: user.uid,
        dataRetentionEnabled: true,
        analyticsEnabled: true,
        sharingEnabled: false,
        exportRequestedAt: "",
        deletionRequestedAt: "",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to load privacy data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      const data = await exportUserData(user.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finsight-ai-data-${user.uid}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully!");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteData() {
    if (!user) return;
    if (
      !confirm(
        "Are you sure you want to delete all your data? This action cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteUserData(user.uid);
      toast.success("All data deleted successfully");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete data");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
              Privacy Dashboard
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              Manage your data and privacy settings
            </p>
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500 mt-4">
              Loading privacy settings...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
            Privacy Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Control your data, sessions, and privacy preferences
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Data Management
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Export or delete your financial data
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-400">
                    <Download size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      Export My Data
                    </p>
                    <p className="text-xs text-slate-500">
                      Download all your data as JSON
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest h-9 px-4"
                >
                  {exporting ? "Exporting..." : "Export"}
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-red-600/10 flex items-center justify-center text-red-400">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      Delete All Data
                    </p>
                    <p className="text-xs text-slate-500">
                      Permanently remove all your data
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleDeleteData}
                  disabled={deleting}
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-xs uppercase tracking-widest h-9 px-4"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Privacy Preferences
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Configure your data sharing and retention settings
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {privacySettings && (
                <>
                  <PrivacyToggle
                    label="Data Retention"
                    description="Keep transaction history and analysis data"
                    enabled={privacySettings.dataRetentionEnabled}
                    onChange={(enabled) =>
                      setPrivacySettings({
                        ...privacySettings,
                        dataRetentionEnabled: enabled,
                      })
                    }
                  />
                  <PrivacyToggle
                    label="Usage Analytics"
                    description="Allow anonymous usage analytics to improve the service"
                    enabled={privacySettings.analyticsEnabled}
                    onChange={(enabled) =>
                      setPrivacySettings({
                        ...privacySettings,
                        analyticsEnabled: enabled,
                      })
                    }
                  />
                  <PrivacyToggle
                    label="Data Sharing"
                    description="Share anonymized data for research purposes"
                    enabled={privacySettings.sharingEnabled}
                    onChange={(enabled) =>
                      setPrivacySettings({
                        ...privacySettings,
                        sharingEnabled: enabled,
                      })
                    }
                  />
                  <PrivacyToggle
                    label="Two-Factor Authentication (2FA)"
                    description="Require an extra security step when logging in"
                    enabled={privacySettings.mfaEnabled}
                    onChange={(enabled) =>
                      setPrivacySettings({
                        ...privacySettings,
                        mfaEnabled: enabled,
                      })
                    }
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-800">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Activity Log
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Recent account activity
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {activityLog.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No activity recorded yet
                </p>
              ) : (
                <div className="space-y-3">
                  {activityLog.slice(0, 10).map((log, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                          <Activity size={14} />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-200">
                            {log.action}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {log.details}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {log.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SessionManager user={user} />
        </div>
      </div>
    </div>
  );
}

function PrivacyToggle({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
      <div className="flex-1">
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-slate-700"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
