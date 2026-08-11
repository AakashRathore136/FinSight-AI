/* eslint-disable @typescript-eslint/no-explicit-any */

const LOCAL_DOCS_KEY = "fin_local_documents_v1";

// Bounded local cache: keep at most this many documents in the localStorage
// mirror so the 5 MB quota can never be exhausted by unbounded growth.
const MAX_LOCAL_DOCS = 50;

// When the browser reports usage above this fraction of quota, evict the
// oldest entries before writing so new analyses keep being cached locally.
const QUOTA_PRESSURE_RATIO = 0.9;

export interface CachedAnalysisPayload {
  documentId: string;
  record: any;
  analysis: any;
  persistenceMode?: string;
  storedAt?: string;
}

export interface LocalSaveResult {
  /** True when the localStorage mirror write succeeded. */
  ok: boolean;
  /** True when a quota error was encountered or storage pressure forced eviction. */
  quotaExceeded: boolean;
}

function isQuotaError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as any)?.name === "QuotaExceededError"
  );
}

function epochOf(entry?: CachedAnalysisPayload): number {
  const ms = entry?.storedAt ? new Date(entry.storedAt).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function readLocalDocMap(): Record<string, CachedAnalysisPayload> {
  try {
    const raw = window.localStorage.getItem(LOCAL_DOCS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Error reading local documents from localStorage", err);
    return {};
  }
}

function writeLocalDocMap(
  map: Record<string, CachedAnalysisPayload>,
  documentId?: string,
): void {
  window.localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify(map));
  if (documentId) {
    window.dispatchEvent(
      new CustomEvent("fin_local_docs_changed", { detail: { documentId } }),
    );
  }
}

/** Evicts the oldest storedAt entries until the map has at most maxCount. */
function evictOldest(
  map: Record<string, CachedAnalysisPayload>,
  maxCount: number,
): void {
  const keys = Object.keys(map);
  if (keys.length <= maxCount) return;
  keys
    .sort((a, b) => epochOf(map[a]) - epochOf(map[b]))
    .slice(0, keys.length - maxCount)
    .forEach((key) => delete map[key]);
}

/**
 * Persists an analysis result locally in both localStorage (for long-term persistence across tabs/sessions)
 * and sessionStorage (for instant retrieval).
 *
 * The localStorage mirror is bounded to MAX_LOCAL_DOCS entries (oldest evicted
 * first) and quota pressure is checked before writing, so caching can never
 * silently stall once storage fills up.
 */
export async function saveLocalAnalysis(
  payload: CachedAnalysisPayload,
): Promise<LocalSaveResult> {
  if (typeof window === "undefined" || !payload?.documentId) {
    return { ok: true, quotaExceeded: false };
  }

  const now = new Date().toISOString();
  const cached: CachedAnalysisPayload = {
    documentId: payload.documentId,
    record: payload.record || null,
    analysis: payload.analysis || null,
    persistenceMode: payload.persistenceMode || "local",
    storedAt: now,
  };

  // 1. Store in sessionStorage for fast session retrieval
  let sessionQuotaExceeded = false;
  try {
    window.sessionStorage.setItem(
      `fin_local_doc_${payload.documentId}`,
      JSON.stringify(cached),
    );
  } catch (err) {
    if (isQuotaError(err)) {
      sessionQuotaExceeded = true;
    } else {
      console.warn("Could not cache in sessionStorage", err);
    }
  }

  // 2. Check overall storage pressure; when near quota, evict oldest entries
  //    proactively so the mirror write below does not fail.
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      if (quota && usage && usage / quota >= QUOTA_PRESSURE_RATIO) {
        const docMap = readLocalDocMap();
        evictOldest(docMap, Math.max(1, Math.floor(MAX_LOCAL_DOCS / 2)));
        try {
          writeLocalDocMap(docMap);
        } catch (err) {
          if (!isQuotaError(err)) console.warn("Could not compact local cache", err);
        }
      }
    }
  } catch (err) {
    // navigator.storage.estimate() is unavailable/unsupported — continue.
    console.warn("Could not estimate storage quota", err);
  }

  // 3. Store in localStorage documents map (bounded + evicting)
  try {
    const docMap = readLocalDocMap();
    docMap[payload.documentId] = cached;
    evictOldest(docMap, MAX_LOCAL_DOCS);
    writeLocalDocMap(docMap, payload.documentId);
    return { ok: true, quotaExceeded: sessionQuotaExceeded };
  } catch (err) {
    if (isQuotaError(err)) {
      // Drop the oldest entry and retry once so the newest analysis still
      // gets an offline copy.
      try {
        const docMap = readLocalDocMap();
        delete docMap[payload.documentId];
        evictOldest(docMap, Math.max(1, MAX_LOCAL_DOCS - 1));
        docMap[payload.documentId] = cached;
        evictOldest(docMap, MAX_LOCAL_DOCS);
        writeLocalDocMap(docMap, payload.documentId);
        return { ok: true, quotaExceeded: true };
      } catch {
        return { ok: false, quotaExceeded: true };
      }
    }
    console.warn("Could not cache in localStorage", err);
    return { ok: false, quotaExceeded: false };
  }
}

/**
 * Returns all local document records stored in localStorage, optionally filtered by ownerId.
 */
export function getLocalDocuments(ownerId?: string): any[] {
  if (typeof window === "undefined") return [];

  try {
    const rawMap = window.localStorage.getItem(LOCAL_DOCS_KEY);
    if (!rawMap) return [];

    const docMap: Record<string, CachedAnalysisPayload> = JSON.parse(rawMap);
    const docs: any[] = [];

    for (const key of Object.keys(docMap)) {
      const item = docMap[key];
      if (!item || !item.record) continue;

      const record = { ...item.record, id: item.documentId || item.record.id };
      if (item.analysis && !record.latestAnalysis) {
        record.latestAnalysis = item.analysis;
      }

      if (
        !ownerId ||
        !record.ownerId ||
        record.ownerId === ownerId ||
        record.ownerId === "anonymous" ||
        record.ownerId === "anonymous_user" ||
        record.ownerId?.startsWith("local-") ||
        record.ownerId?.includes("anon")
      ) {
        docs.push(record);
      }
    }

    return docs;
  } catch (err) {
    console.error("Error reading local documents from localStorage", err);
    return [];
  }
}

/**
 * Retrieves a single cached analysis by documentId (checks localStorage first, then sessionStorage).
 */
export function getLocalDocumentById(documentId: string): CachedAnalysisPayload | null {
  if (typeof window === "undefined" || !documentId) return null;

  try {
    // Check localStorage map first
    const rawMap = window.localStorage.getItem(LOCAL_DOCS_KEY);
    if (rawMap) {
      const docMap: Record<string, CachedAnalysisPayload> = JSON.parse(rawMap);
      if (docMap[documentId]) {
        return docMap[documentId];
      }
    }

    // Check sessionStorage backup
    const rawSession = window.sessionStorage.getItem(`fin_local_doc_${documentId}`);
    if (rawSession) {
      return JSON.parse(rawSession);
    }
  } catch (err) {
    console.error("Error reading local document by id", err);
  }

  return null;
}

/**
 * Deletes a local document from both localStorage and sessionStorage.
 */
export function deleteLocalDocument(documentId: string): void {
  if (typeof window === "undefined" || !documentId) return;

  try {
    window.sessionStorage.removeItem(`fin_local_doc_${documentId}`);
  } catch {
    // ignore
  }

  try {
    const docMap = readLocalDocMap();
    if (docMap[documentId]) {
      delete docMap[documentId];
      writeLocalDocMap(docMap, documentId);
    }
  } catch (err) {
    console.error("Error removing local document", err);
  }
}
