/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
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

export function AnalysisList({ type, user, onSelect }: any) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
        updateCombinedDocuments(remoteDocs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "documents");
        // Even if Firestore fails, show local documents
        updateCombinedDocuments([]);
      },
    );

    const handleLocalDocsChanged = () => {
      updateCombinedDocuments(documents.filter((d) => !d.id?.startsWith("local-")));
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
          body: JSON.stringify({ storagePath }),
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

  const filteredDocs = documents.filter((doc) =>
    String(doc.fileName || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            size={16}
          />
          <Input
            placeholder="Search records..."
            className="pl-10 h-10 bg-slate-900 border-slate-800 text-white focus-visible:border-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-10 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white"
        >
          <Filter className="mr-2" size={14} /> Refine View
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl shadow-black/50">
        <Table>
          <TableHeader className="bg-slate-900">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-[400px] text-[10px] font-bold uppercase tracking-widest text-slate-500 px-6 py-5">
                Account & Entity
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
              <TableHead className="w-[80px] text-right px-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800/50">
                  <TableCell className="px-6 py-5">
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
                    <Skeleton className="h-8 w-8 ml-auto bg-slate-800/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-80 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
                      <FileSearch size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">
                        No documents found
                      </p>
                      <p className="text-sm max-w-xs mx-auto">
                        Either you haven't uploaded any documents, or your
                        search parameters returned 0 results.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredDocs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="border-slate-800/50 hover:bg-slate-800/20 transition-colors group"
                >
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-lg">
                        <FileText size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-white tracking-tight truncate max-w-[300px]">
                          {doc.fileName}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">
                          {(Number(doc.fileSize || 0) / 1024 / 1024).toFixed(2)}{" "}
                          MB -{" "}
                          {String(doc.fileType || "")
                            .split("/")[1]
                            ?.toUpperCase() || "DOC"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.riskLevel ? (
                      <Badge
                        className={`
                        capitalize font-bold text-[9px] px-2.5 py-0.5 tracking-wider rounded-md border-0
                        ${
                          doc.riskLevel === "high"
                            ? "bg-red-500/10 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                            : doc.riskLevel === "medium"
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
                  <TableCell>
                    <StatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-slate-500 tabular-nums">
                    {formatDateSafe(doc.createdAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="px-6 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 text-slate-500 hover:text-white hover:bg-slate-800">
                        <MoreVertical size={18} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-56 p-2 bg-slate-900 border-slate-800 text-slate-300"
                      >
                        <DropdownMenuItem
                          onClick={() => onSelect(doc.id)}
                          className="gap-3 py-2.5 focus:bg-slate-800 focus:text-white rounded-lg"
                        >
                          <Eye size={16} /> View Intelligence Report
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleDownload(doc.id, doc.storagePath, doc.fileName)
                          }
                          disabled={downloadingId === doc.id}
                          className="gap-3 py-2.5 focus:bg-slate-800 focus:text-white rounded-lg"
                        >
                          <Download size={16} />{" "}
                          {downloadingId === doc.id
                            ? "Preparing download..."
                            : "Download Source File"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-800" />
                        <DropdownMenuItem
                          onClick={() => handleDelete(doc.id, doc.fileName)}
                          className="gap-3 py-2.5 text-red-500 focus:text-red-400 focus:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 size={16} /> Purge Record
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
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


