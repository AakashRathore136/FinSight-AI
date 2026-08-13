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
 * Persists an analysis result locally in the localStorage documents map.
 * The localStorage map is the single source of truth for the local/offline
 * document list, so there is no divergent sessionStorage mirror. The map is
 * bounded to MAX_LOCAL_DOCS entries (oldest evicted first) and quota pressure
 * is checked before writing, so caching can never silently stall once storage
 * fills up.
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

  // Check overall storage pressure; when near quota, evict oldest entries
  // proactively so the mirror write below does not fail.
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
    return { ok: true, quotaExceeded: false };
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
      } catch (err) {
        console.warn("[FinSight] storeLocalDocument failed:", err);
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

      if (!ownerId) {
        docs.push(record);
      } else if (record.ownerId === ownerId) {
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
 * Retrieves a single cached analysis by documentId from the localStorage map.
 */
export function getLocalDocumentById(documentId: string): CachedAnalysisPayload | null {
  if (typeof window === "undefined" || !documentId) return null;

  try {
    const rawMap = window.localStorage.getItem(LOCAL_DOCS_KEY);
    if (rawMap) {
      const docMap: Record<string, CachedAnalysisPayload> = JSON.parse(rawMap);
      if (docMap[documentId]) {
        return docMap[documentId];
      }
    }
  } catch (err) {
    console.error("Error reading local document by id", err);
  }

  return null;
}

/**
 * Deletes a local document from the localStorage map.
 */
export function deleteLocalDocument(documentId: string): void {
  if (typeof window === "undefined" || !documentId) return;

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

/**
 * Clears every locally-cached analysis payload — the localStorage documents
 * map and all sessionStorage fin_local_doc_* entries. Called from account
 * erasure (and logout) so deleted or abandoned financial data never survives
 * on the device.
 */
export function clearAllLocalData(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LOCAL_DOCS_KEY);
  } catch {
    // ignore
  }

  try {
    const session = window.sessionStorage;
    const doomed: string[] = [];
    for (let i = 0; i < session.length; i++) {
      const key = session.key(i);
      if (key && key.startsWith("fin_local_doc_")) doomed.push(key);
    }
    doomed.forEach((key) => session.removeItem(key));
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(
      new CustomEvent("fin_local_docs_changed", { detail: { cleared: true } }),
    );
  } catch {
    // ignore
  }
}
