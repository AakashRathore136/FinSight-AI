/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from "react";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { apiFetch } from "@/src/lib/api";
import {
  FileText,
  MoreVertical,
  Trash2,
  Eye,
  Download,
  Search,
  Filter,
  FileSearch,
  AlertCircle,
  Clock,
  CheckCircle2,
  Scale,
  Sparkles,
  Layers,
  ArrowUpDown,
  RotateCcw,
  Upload,
  BarChart3,
  FileSpreadsheet,
  FileCode,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import { toast } from "sonner";
import { formatDateSafe } from "@/src/lib/utils";
import { getLocalDocuments, deleteLocalDocument } from "@/src/lib/storageUtils";
import { DocumentComparisonModal } from "./DocumentComparisonModal";
import { DocumentQuickPreviewModal } from "./DocumentQuickPreviewModal";

export function AnalysisList({ type, user, onSelect, onUploadClick }: any) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Comparison State
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Quick Preview State
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const latestRemoteRef = useRef<any[]>([]);

  useEffect(() => {
    if (!user) return;

    let docsQuery = query(
      collection(db, "documents"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );

    if (type === "completed") {
      docsQuery = query(
        collection(db, "documents"),
        where("ownerId", "==", user.uid),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
      );
    }

    const updateCombinedDocuments = (remoteDocs: any[]) => {
      const localDocs = getLocalDocuments(user.uid);
      const docMap = new Map<string, any>();

      for (const ld of localDocs) {
        if (type === "completed" && ld.status !== "completed") continue;
        docMap.set(ld.id, ld);
      }

      for (const rd of remoteDocs) {
        if (type === "completed" && rd.status !== "completed") continue;
        docMap.set(rd.id, rd);
      }

      const merged = Array.from(docMap.values());
      merged.sort((a, b) => {
        const getTs = (d: any) => {
          if (!d.createdAt) return 0;
          if (typeof d.createdAt === "number") return d.createdAt;
          if (typeof d.createdAt.toDate === "function") return d.createdAt.toDate().getTime();
          if (d.createdAt.seconds) return d.createdAt.seconds * 1000;
          const parsed = new Date(d.createdAt).getTime();
          return isNaN(parsed) ? 0 : parsed;
        };
        return getTs(b) - getTs(a);
      });

      setDocuments(merged);
      setLoading(false);
    };

    const unsubscribe = onSnapshot(
      docsQuery,
      (snapshot) => {
        const remoteDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        latestRemoteRef.current = remoteDocs;
        updateCombinedDocuments(remoteDocs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "documents");
        // Even if Firestore fails, show local documents
        latestRemoteRef.current = [];
        updateCombinedDocuments([]);
      },
    );

    const handleLocalDocsChanged = () => {
      updateCombinedDocuments(latestRemoteRef.current);
    };
    window.addEventListener("fin_local_docs_changed", handleLocalDocsChanged);

    return () => {
      unsubscribe();
      window.removeEventListener("fin_local_docs_changed", handleLocalDocsChanged);
    };
  }, [user, type]);

  const handleDelete = async (id: string, fileName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${fileName}? This will also delete the analysis.`,
      )
    )
      return;

    if (id.startsWith("local-")) {
      // Local-fallback documents exist only as Storage objects with no
      // Firestore record, so before dropping the local mirror purge the object
      // server-side (namespace + uploadedBy verified by the API). If the purge
      // request fails, the local removal still proceeds but a warning is kept.
      const localDoc = documents.find((doc) => doc.id === id);
      if (localDoc?.storagePath) {
        try {
          const headers: Record<string, string> = {};
          try {
            const idToken = await (user as any)?.getIdToken?.();
            if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
          } catch (tErr) {
            console.warn("Could not fetch ID token for local document purge", tErr);
          }
          const res = await apiFetch(
            "/api/documents/delete",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...headers,
              },
              body: JSON.stringify({ documentId: id, storagePath: localDoc.storagePath }),
            },
            { timeout: 30000 },
          );
          if (!res.ok) {
            console.warn(`Local Storage purge failed (${res.status}) for ${id}`);
          }
        } catch (purgeErr) {
          console.warn("Local Storage purge failed:", purgeErr);
        }
      }
      deleteLocalDocument(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      toast.success("Document removed");
      return;
    }

    try {
      const headers: Record<string, string> = {};
      try {
        const idToken = await (user as any)?.getIdToken?.();
        if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
      } catch (tErr) {
        console.warn("Could not fetch ID token for document purge", tErr);
      }

      const res = await apiFetch(
        "/api/documents/delete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify({ documentId: id }),
        },
        { timeout: 30000 },
      );

      if (!res.ok) {
        let errorText = "";
        try {
          const errorBody = await res.json();
          errorText = String(errorBody?.error || "");
        } catch {
          errorText = await res.text().catch(() => "");
        }
        throw new Error(errorText || `Failed to purge record (${res.status})`);
      }

      // Purge the local mirror too, or the deleted record is re-inserted from
      // localStorage on the next snapshot. (Issue #869)
      deleteLocalDocument(id);
      // Optimistically remove the deleted document from the live list so it
      // doesn't linger (or reappear after a refresh) before the Firestore
      // onSnapshot re-emit lands. Previously the success path never touched
      // local state, so a deleted record stayed visible until the snapshot
      // caught up — and any cached/local copy would reinsert it.
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      toast.success("Document removed");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `documents/${id}`);
      deleteLocalDocument(id);
      toast.error("Failed to delete document");
    }
  };

  const handleDownload = async (
    id: string,
    storagePath: string,
    fileName: string,
  ) => {
    if (!storagePath) {
      toast.error("Source file is not available for this record");
      return;
    }

    setDownloadingId(id);
    try {
      const headers: Record<string, string> = {};
      try {
        const idToken = await (user as any)?.getIdToken?.();
        if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
      } catch (tErr) {
        console.warn("Could not fetch ID token for document download", tErr);
      }

      const res = await apiFetch(
        "/api/document-download-url",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify({ storagePath, documentId: id }),
        },
        { timeout: 30000 },
      );

      if (!res.ok) {
        let errorText = "";
        try {
          const errorBody = await res.json();
          errorText = String(errorBody?.error || "");
        } catch {
          errorText = await res.text().catch(() => "");
        }
        throw new Error(
          errorText || `Failed to generate download URL (${res.status})`,
        );
      }

      const data = await res.json();
      if (!data?.signedUrl) {
        throw new Error("Download URL generation returned no URL");
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `documents/${id}`);
      toast.error(`Failed to download ${fileName}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const getDocTimestamp = (d: any): number => {
    if (!d?.createdAt) return 0;
    if (typeof d.createdAt === "number") return d.createdAt;
    if (typeof d.createdAt.toDate === "function") return d.createdAt.toDate().getTime();
    if (d.createdAt.seconds) return d.createdAt.seconds * 1000;
    const parsed = new Date(d.createdAt).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  // Selection toggle for comparison
  const toggleSelectForCompare = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 2) {
        toast.info("Comparison is limited to 2 documents at a time. Replaced first selection.");
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  // Metrics Summary Calculations
  const stats = useMemo(() => {
    const total = documents.length;
    const completed = documents.filter((d) => d.status === "completed").length;
    const highRisk = documents.filter((d) => String(d.riskLevel).toLowerCase() === "high").length;
    const mediumRisk = documents.filter((d) => String(d.riskLevel).toLowerCase() === "medium").length;
    const lowRisk = documents.filter((d) => String(d.riskLevel).toLowerCase() === "low").length;
    
    return {
      total,
      completed,
      highRisk,
      mediumRisk,
      lowRisk,
    };
  }, [documents]);

  // Filtering & Sorting
  const filteredAndSortedDocs = useMemo(() => {
    const now = Date.now();

    return documents
      .filter((doc) => {
        // Search term (filename or summary)
        const term = searchTerm.toLowerCase().trim();
        if (term) {
          const matchName = String(doc.fileName || "").toLowerCase().includes(term);
          const matchSummary = String(doc.latestAnalysis?.summary || "").toLowerCase().includes(term);
          if (!matchName && !matchSummary) return false;
        }

        // Risk filter
        if (riskFilter !== "all") {
          const r = String(doc.riskLevel || "").toLowerCase();
          if (r !== riskFilter) return false;
        }

        // Status filter
        if (statusFilter !== "all") {
          const s = String(doc.status || "pending").toLowerCase();
          if (s !== statusFilter) return false;
        }

        // Date filter
        if (dateFilter !== "all") {
          const docTs = getDocTimestamp(doc);
          if (!docTs) return false;
          const diffMs = now - docTs;
          if (dateFilter === "24h" && diffMs > 24 * 60 * 60 * 1000) return false;
          if (dateFilter === "7d" && diffMs > 7 * 24 * 60 * 60 * 1000) return false;
          if (dateFilter === "30d" && diffMs > 30 * 24 * 60 * 60 * 1000) return false;
          if (dateFilter === "90d" && diffMs > 90 * 24 * 60 * 60 * 1000) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return getDocTimestamp(b) - getDocTimestamp(a);
        }
        if (sortBy === "oldest") {
          return getDocTimestamp(a) - getDocTimestamp(b);
        }
        if (sortBy === "name_asc") {
          return String(a.fileName || "").localeCompare(String(b.fileName || ""));
        }
        if (sortBy === "risk_desc") {
          const riskWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
          const rA = riskWeight[String(a.riskLevel || "").toLowerCase()] || 0;
          const rB = riskWeight[String(b.riskLevel || "").toLowerCase()] || 0;
          return rB - rA;
        }
        return 0;
      });
  }, [documents, searchTerm, riskFilter, statusFilter, dateFilter, sortBy]);

  const hasActiveFilters =
    searchTerm !== "" ||
    riskFilter !== "all" ||
    statusFilter !== "all" ||
    dateFilter !== "all" ||
    sortBy !== "newest";

  const handleResetFilters = () => {
    setSearchTerm("");
    setRiskFilter("all");
    setStatusFilter("all");
    setDateFilter("all");
    setSortBy("newest");
  };

  // Export History (CSV / JSON)
  const handleExportCSV = () => {
    if (filteredAndSortedDocs.length === 0) {
      toast.error("No documents to export");
      return;
    }
    const headers = ["Document ID", "File Name", "Risk Level", "Status", "File Size (Bytes)", "Created Date", "Summary"];
    const rows = filteredAndSortedDocs.map((doc) => [
      `"${doc.id}"`,
      `"${String(doc.fileName || "").replace(/"/g, '""')}"`,
      `"${doc.riskLevel || "unassessed"}"`,
      `"${doc.status || "pending"}"`,
      doc.fileSize || 0,
      `"${formatDateSafe(doc.createdAt)}"`,
      `"${String(doc.latestAnalysis?.summary || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FinSight_Document_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Document history exported as CSV");
  };

  const handleExportJSON = () => {
    if (filteredAndSortedDocs.length === 0) {
      toast.error("No documents to export");
      return;
    }
    const dataToExport = filteredAndSortedDocs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileSize: d.fileSize,
      fileType: d.fileType,
      riskLevel: d.riskLevel,
      status: d.status,
      createdAt: formatDateSafe(d.createdAt),
      summary: d.latestAnalysis?.summary || null,
      keyMetrics: d.latestAnalysis?.key_metrics || d.latestAnalysis?.keyMetrics || null,
    }));
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FinSight_Document_History_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Document history exported as JSON");
  };

  const docsToCompare = useMemo(() => {
    return documents.filter((d) => selectedForCompare.includes(d.id));
  }, [documents, selectedForCompare]);

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Documents</p>
            <p className="text-xl font-bold text-white tabular-nums">{stats.total}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Completed Analyses</p>
            <p className="text-xl font-bold text-emerald-400 tabular-nums">{stats.completed}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
          <div className="h-10 w-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 border border-red-500/20">
            <AlertCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">High Risk Flagged</p>
            <p className="text-xl font-bold text-red-500 tabular-nums">{stats.highRisk}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
            <BarChart3 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Med / Low Risk</p>
            <p className="text-xl font-bold text-slate-200 tabular-nums">
              {stats.mediumRisk + stats.lowRisk}
            </p>
          </div>
        </div>
      </div>

      {/* Floating / Sticky Comparison Bar */}
      {selectedForCompare.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900/90 to-indigo-950/90 border border-indigo-500/40 p-3.5 rounded-xl shadow-xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Scale size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                {selectedForCompare.length} of 2 documents selected for side-by-side comparison
              </p>
              <p className="text-[11px] text-slate-400">
                {selectedForCompare.length === 1
                  ? "Select one more document to enable dual comparison mode."
                  : "Ready! Compare stored risk assessments and executive summaries."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedForCompare([])}
              className="h-8 text-xs border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Clear
            </Button>
            <Button
              size="sm"
              disabled={selectedForCompare.length < 2}
              onClick={() => setIsCompareModalOpen(true)}
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30"
            >
              <Scale size={14} className="mr-1.5" /> Compare Analyses
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              size={16}
            />
            <Input
              placeholder="Search by file name or insight keywords..."
              className="pl-10 h-10 bg-slate-950/80 border-slate-800 text-white focus-visible:border-indigo-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Action Export Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white"
                >
                  <Download size={14} className="mr-1.5" /> Export History
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-300">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2.5 py-2 focus:bg-slate-800 focus:text-white">
                  <FileSpreadsheet size={15} className="text-emerald-400" /> Export CSV Spreadsheet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportJSON} className="gap-2.5 py-2 focus:bg-slate-800 focus:text-white">
                  <FileCode size={15} className="text-indigo-400" /> Export JSON Data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-10 text-slate-400 hover:text-white hover:bg-slate-800"
                title="Reset all filters"
              >
                <RotateCcw size={14} className="mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/60 text-xs">
          <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 mr-1">
            <Filter size={12} /> Filters:
          </span>

          {/* Risk Level Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>

          {/* Status Filter (if not strictly completed view) */}
          {type !== "completed" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          )}

          {/* Date Range Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Time</option>
            <option value="24h">Past 24 Hours</option>
            <option value="7d">Past 7 Days</option>
            <option value="30d">Past 30 Days</option>
            <option value="90d">Past 90 Days</option>
          </select>

          {/* Sort By Filter */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
              <ArrowUpDown size={12} /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="risk_desc">Risk: High to Low</option>
              <option value="name_asc">File Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl shadow-black/50">
        <Table>
          <TableHeader className="bg-slate-900/90 backdrop-blur">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-[50px] px-4 text-center">
                <span className="sr-only">Compare Select</span>
              </TableHead>
              <TableHead className="w-[360px] text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-5">
                Document & Insights
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Risk Assessment
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                System Status
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Ingested At
              </TableHead>
              <TableHead className="w-[180px] text-right px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800/50">
                  <TableCell className="px-4">
                    <Skeleton className="h-4 w-4 bg-slate-800/50 rounded" />
                  </TableCell>
                  <TableCell className="px-4 py-5">
                    <Skeleton className="h-12 w-full bg-slate-800/50" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 bg-slate-800/50" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-24 bg-slate-800/50" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28 bg-slate-800/50" />
                  </TableCell>
                  <TableCell className="px-6">
                    <Skeleton className="h-8 w-24 ml-auto bg-slate-800/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredAndSortedDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-80 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
                      <FileSearch size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">
                        {hasActiveFilters ? "No matching records found" : "No documents found"}
                      </p>
                      <p className="text-sm max-w-xs mx-auto text-slate-400">
                        {hasActiveFilters
                          ? "Try adjusting your search terms or filter parameters to find matching documents."
                          : "Upload a financial statement or report to analyze and generate AI intelligence insights."}
                      </p>
                    </div>
                    {hasActiveFilters ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetFilters}
                        className="mt-2 border-slate-700 hover:bg-slate-800 text-slate-300"
                      >
                        <RotateCcw size={14} className="mr-1.5" /> Clear Filters
                      </Button>
                    ) : (
                      onUploadClick && (
                        <Button
                          size="sm"
                          onClick={onUploadClick}
                          className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                        >
                          <Upload size={14} className="mr-1.5" /> Upload Document
                        </Button>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedDocs.map((doc) => {
                const isSelected = selectedForCompare.includes(doc.id);
                return (
                  <TableRow
                    key={doc.id}
                    className={`border-slate-800/50 hover:bg-slate-800/20 transition-colors group ${
                      isSelected ? "bg-indigo-950/20 border-l-2 border-l-indigo-500" : ""
                    }`}
                  >
                    {/* Compare Selection Checkbox */}
                    <TableCell className="px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectForCompare(doc.id)}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Select for comparison"
                      />
                    </TableCell>

                    {/* Document Info & Summary Snippet */}
                    <TableCell className="px-4 py-4">
                      <div className="flex items-start gap-3.5">
                        <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-lg mt-0.5">
                          <FileText size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-bold text-white tracking-tight truncate max-w-[280px] hover:text-indigo-400 cursor-pointer transition-colors"
                            onClick={() => onSelect(doc.id)}
                            title={doc.fileName}
                          >
                            {doc.fileName}
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">
                            {(Number(doc.fileSize || 0) / 1024 / 1024).toFixed(2)} MB •{" "}
                            {String(doc.fileType || "")
                              .split("/")[1]
                              ?.toUpperCase() || "PDF"}
                          </p>
                          {doc.latestAnalysis?.summary && (
                            <p className="text-xs text-slate-400 line-clamp-1 mt-1 max-w-[300px]">
                              {doc.latestAnalysis.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Risk Level Badge */}
                    <TableCell>
                      {doc.riskLevel ? (
                        <Badge
                          className={`
                          capitalize font-bold text-[9px] px-2.5 py-0.5 tracking-wider rounded-md border-0
                          ${
                            String(doc.riskLevel).toLowerCase() === "high"
                              ? "bg-red-500/10 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                              : String(doc.riskLevel).toLowerCase() === "medium"
                                ? "bg-amber-500/10 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                                : "bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                          }
                        `}
                        >
                          {doc.riskLevel} Risk
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">
                          In Assessment
                        </span>
                      )}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>

                    {/* Ingested Timestamp */}
                    <TableCell className="text-sm font-semibold text-slate-400 tabular-nums">
                      {formatDateSafe(doc.createdAt, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>

                    {/* Direct Actions */}
                    <TableCell className="px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1-Click View Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSelect(doc.id)}
                          className="h-8 px-2.5 text-xs text-indigo-300 border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-colors"
                          title="View Intelligence Report"
                        >
                          <Eye size={13} className="mr-1" /> View
                        </Button>

                        {/* Quick Preview Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewDoc(doc)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                          title="Quick Preview Insights"
                        >
                          <Sparkles size={14} />
                        </Button>

                        {/* Action Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                            >
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-56 p-2 bg-slate-900 border-slate-800 text-slate-300 shadow-xl"
                          >
                            <DropdownMenuItem
                              onClick={() => onSelect(doc.id)}
                              className="gap-3 py-2.5 focus:bg-slate-800 focus:text-white rounded-lg cursor-pointer"
                            >
                              <Eye size={16} className="text-indigo-400" /> View Intelligence Report
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setPreviewDoc(doc)}
                              className="gap-3 py-2.5 focus:bg-slate-800 focus:text-white rounded-lg cursor-pointer"
                            >
                              <Sparkles size={16} className="text-amber-400" /> Quick Insight Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleDownload(doc.id, doc.storagePath, doc.fileName)
                              }
                              disabled={downloadingId === doc.id}
                              className="gap-3 py-2.5 focus:bg-slate-800 focus:text-white rounded-lg cursor-pointer"
                            >
                              <Download size={16} className="text-emerald-400" />{" "}
                              {downloadingId === doc.id
                                ? "Preparing download..."
                                : "Download Source File"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem
                              onClick={() => handleDelete(doc.id, doc.fileName)}
                              className="gap-3 py-2.5 text-red-500 focus:text-red-400 focus:bg-red-500/10 rounded-lg cursor-pointer"
                            >
                              <Trash2 size={16} /> Purge Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Comparison Modal */}
      <DocumentComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        docs={docsToCompare}
        user={user}
        onSelectDoc={onSelect}
      />

      {/* Quick Preview Modal */}
      <DocumentQuickPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        doc={previewDoc}
        user={user}
        onOpenFullReport={onSelect}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: any = {
    completed: {
      label: "Completed",
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    processing: {
      label: "Analyzing",
      className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    },
    pending: {
      label: "Queueing",
      className: "bg-slate-800 text-slate-500 border-slate-700",
    },
    failed: {
      label: "Failure",
      className: "bg-red-500/10 text-red-400 border-red-500/20",
    },
  };

  const { label, className } = config[status] || config.pending;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${className} shadow-[0_2px_10px_-3px_rgba(0,0,0,0.5)]`}
    >
      {status === "processing" && (
        <Clock size={10} className="animate-spin duration-1000" />
      )}
      {status === "completed" && <CheckCircle2 size={10} />}
      {status === "failed" && <AlertCircle size={10} />}
      {label}
    </div>
  );
}
