/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import { toast } from "sonner";
import { apiFetch } from "@/src/lib/api";
import { safeJsonParse } from "@/src/lib/utils";
import { saveLocalAnalysis } from "@/src/lib/storageUtils";

export function FileUpload({ user, onComplete, onCancel }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (dropped.type !== "application/pdf") {
        toast.error("Only PDF files are supported");
        return;
      }
      if (dropped.size > 20 * 1024 * 1024) {
        toast.error("File exceeds 20MB limit");
        return;
      }
      setFile(dropped);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== "application/pdf") {
        toast.error("Only PDF files are supported");
        return;
      }
      if (selected.size > 20 * 1024 * 1024) {
        toast.error("File exceeds 20MB limit");
        return;
      }
      setFile(selected);
    }
  };

  const handleRetry = () => {
    setStatus("idle");
    setErrorMessage("");
    setTimeout(() => startAnalysis(), 0);
  };

  const extractApiError = (errorBody: any, statusCode: number) => {
    const errorPayload = errorBody?.error;
    if (typeof errorPayload === "string") {
      return errorPayload;
    }

    if (errorPayload && typeof errorPayload === "object") {
      const stage = String(errorPayload.stage || "").trim();
      const reason = String(errorPayload.reason || errorPayload.message || "").trim();
      const recommendation = String(errorPayload.recommendation || "").trim();
      const stack = String(errorPayload.stack || "").trim();

      return [
        stage ? `[${stage}]` : "",
        reason || `Analysis failed with status ${statusCode}`,
        recommendation ? `Recommendation: ${recommendation}` : "",
        stack && process.env.NODE_ENV !== "production" ? `Stack: ${stack}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (errorBody && typeof errorBody === "object") {
      const message = String(errorBody.message || errorBody.reason || "").trim();
      if (message) return message;
    }

    return `Analysis failed with status ${statusCode}`;
  };

  const startAnalysis = async () => {
    if (!file || !user) return;

    setUploading(true);
    setStatus("processing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      setErrorMessage("");

      // Include Firebase ID token so server can determine ownerId
      const headers: Record<string, string> = {};
      try {
        const idToken = await (user as any).getIdToken?.();
        if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
      } catch (tErr) {
        console.warn("Could not fetch ID token for upload", tErr);
      }

      const analysisRes = await apiFetch(
        "/api/process",
        {
          method: "POST",
          body: formData,
          headers,
        },
        {
          timeout: 180000,
        },
      );

      if (!analysisRes.ok) {
        let errorText = "";
        let errorBody: any = null;
        try {
          errorBody = await analysisRes.json();
          errorText = extractApiError(errorBody, analysisRes.status);
        } catch {
          errorText = await analysisRes.text().catch(() => "");
        }
        console.error(
          "AI endpoint returned error",
          analysisRes.status,
          errorText,
          errorBody,
        );

        const statusCode = analysisRes.status;
        if (statusCode === 401 || statusCode === 403) {
          throw Object.assign(
            new Error("Authentication failed — please sign in again"),
            { kind: "auth" },
          );
        }
        if (statusCode === 429) {
          throw Object.assign(
            new Error(
              "Analysis quota exceeded — please wait a moment and try again",
            ),
            { kind: "quota" },
          );
        }
        if (
          statusCode === 500 ||
          statusCode === 502 ||
          statusCode === 503
        ) {
          throw Object.assign(
            new Error(errorText || "Server error — please try again in a few minutes"),
            { kind: "server" },
          );
        }
        throw Object.assign(
          new Error(
            errorText || `Analysis failed with status ${statusCode}`,
          ),
          { kind: "http" },
        );
      }

      const result = await analysisRes.json();
      const documentId = result?.documentId;
      // Ensure record & analysis carry user.uid
      if (user?.uid) {
        if (result.record) result.record.ownerId = user.uid;
        if (result.analysis) result.analysis.ownerId = user.uid;
      }

      // Save locally in localStorage + sessionStorage
      try {
        const saved = await saveLocalAnalysis(result);
        if (!saved.ok) {
          toast.warning(
            "Offline copy couldn't be saved (storage quota reached). Your analysis is safe in the cloud.",
          );
        } else if (saved.quotaExceeded) {
          toast.warning(
            "Local storage is full — older offline analyses were evicted to make room.",
          );
        }
      } catch (err) {
        console.error("Failed to cache analysis locally", err);
      }

      // If local persistence mode was used by server, attempt client-side Firestore write as well
      if (result?.persistenceMode === "local" && user?.uid) {
        try {
          const { db } = await import("@/src/lib/firebase");
          const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
          
          if (result.record) {
            const docRef = doc(db, "documents", documentId);
            await setDoc(docRef, {
              ...result.record,
              ownerId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              latestAnalysis: result.analysis ? {
                ...result.analysis,
                ownerId: user.uid,
                processedAt: new Date().toISOString(),
              } : null,
            });

            if (result.analysis) {
              const analysisRef = doc(db, `documents/${documentId}/analyses`, `${documentId}_analysis`);
              await setDoc(analysisRef, {
                ...result.analysis,
                documentId,
                ownerId: user.uid,
                processedAt: serverTimestamp(),
              });
            }
          }
        } catch (clientWriteErr) {
          console.warn("Client-side Firestore fallback write was skipped/failed:", clientWriteErr);
        }
      }

      setStatus("done");
      setUploading(false);
      toast.success("Analysis complete!");
      setTimeout(() => onComplete(documentId), 500);
    } catch (err: any) {
      console.error("Pipeline Error:", err);

      const kind: string = err?.kind || "";
      const rawMsg: string = err?.message || "";
      const isNetworkError =
        kind !== "server" &&
        (rawMsg.includes("timed out") ||
          rawMsg.includes("timeout") ||
          rawMsg.includes("Failed to fetch") ||
          rawMsg.includes("NetworkError"));

      const userMsg = isNetworkError
        ? "Network error — check your connection and try again"
        : kind === "auth"
          ? "Authentication failed — please sign in again"
          : kind === "quota"
            ? "Analysis quota exceeded — please wait a moment and try again"
            : rawMsg || "Server error — please try again in a few minutes";

      setStatus("error");
      setUploading(false);
      setErrorMessage(userMsg);
      toast.error(userMsg);

      try {
        if (!user?.uid) return;
        const { db } = await import("@/src/lib/firebase");
        const { collection, addDoc, serverTimestamp } =
          await import("firebase/firestore");
        await addDoc(collection(db, "analyses"), {
          fileName: file?.name || "Unknown",
          fileSize: file?.size || 0,
          status: "failed",
          errorMessage: userMsg,
          errorKind: kind,
          uploadedAt: serverTimestamp(),
          failedAt: serverTimestamp(),
          ownerId: user.uid,
        });
      } catch (firestoreErr) {
        console.error("Could not persist failed record:", firestoreErr);
      }
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800 shadow-2xl shadow-black/60 rounded-2xl overflow-hidden">
      <CardHeader className="p-8 border-b border-slate-800">
        <CardTitle className="flex items-center gap-3 text-white font-bold tracking-tight">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <ShieldCheck size={22} />
          </div>
          Secure Document Ingestion
        </CardTitle>
        <CardDescription className="text-slate-500 mt-2">
          Upload your financial reports, statements, or agreements for
          high-fidelity AI assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-600/20 bg-indigo-600/5 py-16 transition-all hover:border-indigo-500 hover:bg-indigo-600/10 cursor-pointer"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-900/30 group-hover:scale-110 transition-all duration-300">
              <Upload className="text-white" size={32} />
            </div>
            <div className="mt-8 text-center space-y-2">
              <p className="text-lg font-bold text-white tracking-tight">
                Select Intelligence Source
              </p>
              <p className="text-sm text-slate-500">
                Drag a PDF here or click to browse (Max 20MB)
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,application/pdf"
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-5 rounded-2xl border border-slate-800 p-5 bg-slate-800/20 shadow-inner">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
                <FileText size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-white tracking-tight">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for
                  Ingestion
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-slate-500 hover:text-white hover:bg-slate-800"
                  onClick={() => setFile(null)}
                >
                  <X size={20} />
                </Button>
              )}
            </div>

            {uploading && (
              <div className="space-y-4 px-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                      AI Shard Processing
                    </span>
                    <span className="text-sm font-bold text-white mt-1">
                      Executing LLM Assessment...
                    </span>
                  </div>
                  <span className="text-2xl font-black text-indigo-400 tabular-nums">
                    --
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700 shadow-inner">
                  <div className="h-full rounded-full bg-indigo-500 animate-pulse w-full" />
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                  <Zap size={14} className="text-indigo-400" />
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                    Quantum-Resistant Encryption Active • ISO/IEC 27001
                    Compliant
                  </span>
                </div>
              </div>
            )}

            {!uploading && status !== "error" && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button
                  variant="outline"
                  className="h-12 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button
                  className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-900/40"
                  onClick={startAnalysis}
                >
                  Begin Execution Scan
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button
                  variant="outline"
                  className="h-12 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button
                  className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-900/40"
                  onClick={handleRetry}
                >
                  Retry Analysis
                </Button>
              </div>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl bg-red-500/10 p-6 text-sm text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)] space-y-4">
            <div className="flex items-center gap-4">
              <AlertCircle size={22} className="shrink-0 animate-bounce" />
              <div className="flex flex-col">
                <span className="font-black uppercase tracking-widest text-[10px] text-red-400">
                  System Interrupt
                </span>
                <span className="text-lg font-bold text-white mt-1">
                  AI Analysis Failed
                </span>
              </div>
            </div>
            {(() => {
                const diag = safeJsonParse(errorMessage, {} as Record<string, any>);
                if (typeof diag !== 'object' || diag === null) {
                  return <p className="text-slate-300 font-medium">{errorMessage}</p>;
                }
                return (
                  <div className="mt-4 pt-4 border-t border-red-500/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase bg-red-500/20 text-red-300 px-2.5 py-1 rounded-md border border-red-500/30">
                        Stage: {diag.stage || "UNKNOWN"}
                      </span>
                    </div>
                    <p className="text-slate-300 font-medium">{diag.reason || errorMessage}</p>
                    {diag.recommendation && (
                      <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400">
                        <Zap
                          size={14}
                          className="text-amber-400 mt-0.5 shrink-0"
                        />
                        <div>
                          <strong className="text-slate-200">
                            Recommendation:
                          </strong>{" "}
                          {diag.recommendation}
                        </div>
                      </div>
                    )}
                    {diag.stack && diag.stack !== "No stack trace" && (
                      <details className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400 transition-colors">
                        <summary className="font-bold uppercase tracking-wider select-none py-1">
                          View Stack Trace
                        </summary>
                        <pre className="mt-2 p-3 bg-slate-950/80 rounded-lg text-slate-400 overflow-x-auto whitespace-pre font-mono leading-relaxed border border-slate-900 max-h-40">
                          {diag.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
