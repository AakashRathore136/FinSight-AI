/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from "react";
import { Search, Upload, FileText, ChevronRight } from "lucide-react";
import { db, auth } from "@/src/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { formatRelativeTime } from "@/src/lib/utils";
import { getLocalDocuments } from "@/src/lib/storageUtils";

interface CommandPaletteProps {
  onAction: (action: string) => void;
  onDocSelect: (id: string) => void;
}

export function CommandPalette({ onAction, onDocSelect }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isWinO = e.metaKey && e.key.toLowerCase() === "o";
      const isAltO = e.altKey && e.key.toLowerCase() === "o";
      const isCtrlSpace = e.ctrlKey && (e.code === "Space" || e.key === " ");
      const isCtrlK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

      if (isWinO || isAltO || isCtrlSpace || isCtrlK) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Self-contained Firestore & local document subscription
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setRecentDocs([]);
        return;
      }

      const docsQuery = query(
        collection(db, "documents"),
        where("ownerId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(5),
      );

      const updateCombinedDocs = (remoteDocs: any[]) => {
        const localDocs = getLocalDocuments(user.uid);
        const map = new Map<string, any>();
        for (const ld of localDocs) map.set(ld.id, ld);
        for (const rd of remoteDocs) map.set(rd.id, rd);
        const combined = Array.from(map.values());
        combined.sort((a, b) => {
          const tA = new Date(a.createdAt || a.storedAt || 0).getTime();
          const tB = new Date(b.createdAt || b.storedAt || 0).getTime();
          return tB - tA;
        });
        setRecentDocs(combined.slice(0, 8));
      };

      const unsubscribeDocs = onSnapshot(
        docsQuery,
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          updateCombinedDocs(docs);
        },
        (error) => {
          console.error("Firestore loading error in Command Palette:", error);
          updateCombinedDocs([]);
        },
      );

      return () => unsubscribeDocs();
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredDocs = recentDocs.filter((doc) =>
    doc.fileName?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAction = (action: string) => {
    setIsOpen(false);
    onAction(action);
  };

  const handleDoc = (id: string) => {
    setIsOpen(false);
    onDocSelect(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 backdrop-blur-sm bg-slate-950/80">
      <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-indigo-900/20 rounded-2xl overflow-hidden flex flex-col z-50">
        {/* Search Input */}
        <div className="flex items-center px-4 py-4 border-b border-slate-800">
          <Search className="h-5 w-5 text-indigo-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500 text-lg focus:ring-0 focus:border-none focus:outline-none"
            placeholder="Search documents or jump to action..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex gap-1.5 ml-3 shrink-0">
            <kbd className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-[10px] font-mono border border-slate-700">
              Alt + O
            </kbd>
            <kbd className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-[10px] font-mono border border-slate-700">
              Ctrl + Space
            </kbd>
            <kbd className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-[10px] font-mono border border-slate-700">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {/* Quick Actions */}
          {!searchQuery && (
            <div className="mb-4">
              <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                Quick Actions
              </div>
              <button
                onClick={() => handleAction("upload")}
                className="w-full flex items-center px-3 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center mr-3 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                  <Upload size={16} />
                </div>
                <span className="flex-1 text-left font-medium">
                  Process New Document
                </span>
                <ChevronRight
                  size={16}
                  className="text-slate-600 group-hover:text-slate-400"
                />
              </button>
              <button
                onClick={() => handleAction("documents")}
                className="w-full flex items-center px-3 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center mr-3 group-hover:bg-slate-700 group-hover:text-white transition-colors">
                  <FileText size={16} />
                </div>
                <span className="flex-1 text-left font-medium">
                  View All Documents
                </span>
                <ChevronRight
                  size={16}
                  className="text-slate-600 group-hover:text-slate-400"
                />
              </button>
            </div>
          )}

          {/* Recent Documents */}
          {filteredDocs.length > 0 ? (
            <div>
              <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                {searchQuery ? "Search Results" : "Recent Analyses"}
              </div>
              {filteredDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => handleDoc(doc.id)}
                  className="w-full flex items-center px-3 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${
                      doc.riskLevel === "high"
                        ? "bg-red-500/20 text-red-400"
                        : doc.riskLevel === "medium"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 text-left truncate pr-4">
                    <div className="font-medium truncate text-slate-200 group-hover:text-white">
                      {doc.fileName}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {formatRelativeTime(doc.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                        doc.status === "completed"
                          ? "border-emerald-500/30 text-emerald-400"
                          : doc.status === "processing"
                            ? "border-indigo-500/30 text-indigo-400"
                            : "border-amber-500/30 text-amber-400"
                      }`}
                    >
                      {doc.status}
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-slate-600 group-hover:text-slate-400"
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            searchQuery && (
              <div className="py-12 text-center text-slate-500">
                <p className="text-sm">No results found for "{searchQuery}"</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
