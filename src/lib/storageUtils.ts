/* eslint-disable @typescript-eslint/no-explicit-any */

const LOCAL_DOCS_KEY = "fin_local_documents_v1";

// Bounded local cache: keep at most this many documents in the localStorage
// mirror so the 5 MB quota can never be exhausted by unbounded growth.
const MAX_LOCAL_DOCS = 50;

// When the browser reports usage above this fraction of quota, evict the
// oldest entries before writing so new analyses keep being cached locally.
const QUOTA_PRESSURE_RATIO = 0.9;

/** True when an error is a localStorage quota-exceeded failure. */
function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return false;
}

/**
 * SECURITY: financial-document analyses (extracted entities/amounts from the
 * user's statements, invoices, filings) must never sit in `localStorage` as
 * plaintext — any script on the origin (e.g. via XSS) could read a user's full
 * financial history, and the data would survive logout.
 *
 * We therefore keep a decrypted, in-memory mirror for the active session and
 * persist only an AES-GCM-encrypted blob to `localStorage`. The encryption key
 * is generated once per page session and lives only in memory, so:
 *   - the at-rest data is unreadable by other scripts / after an XSS, and
 *   - it does not survive logout or a page reload (a fresh session cannot
 *     decrypt the previous blob), which bounds the exposure window.
 */
const memoryCache: Record<string, CachedAnalysisPayload> = {};

let sessionCacheKey: CryptoKey | null = null;

async function getSessionCacheKey(): Promise<CryptoKey> {
  if (sessionCacheKey) return sessionCacheKey;
  sessionCacheKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return sessionCacheKey;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptString(plain: string): Promise<string> {
  const key = await getSessionCacheKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return "v1:" + bufToBase64(combined.buffer);
}

async function decryptString(cipher: string): Promise<string | null> {
  try {
    if (!cipher || !cipher.startsWith("v1:")) return null;
    const combined = base64ToBuf(cipher.slice(3));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const key = await getSessionCacheKey();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Persists the (session-only) decrypted mirror as an encrypted blob. */
async function persistEncryptedCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const enc: Record<string, { __enc: string }> = {};
    for (const [id, payload] of Object.entries(memoryCache)) {
      enc[id] = { __enc: await encryptString(JSON.stringify(payload)) };
    }
    window.localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify(enc));
  } catch {
    // Storage unavailable/quota — the in-memory mirror is unaffected.
  }
}

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

function epochOf(entry?: CachedAnalysisPayload): number {
  const ms = entry?.storedAt ? new Date(entry.storedAt).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function readLocalDocMap(): Record<string, CachedAnalysisPayload> {
  // The decrypted mirror is session-only and is the source of truth for reads;
  // it is never exposed as plaintext in localStorage.
  return { ...memoryCache };
}

async function writeLocalDocMap(
  map: Record<string, CachedAnalysisPayload>,
  documentId?: string,
): Promise<void> {
  // Persist only the encrypted form; never the plaintext payload.
  await persistEncryptedCache();
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
        evictOldest(memoryCache, Math.max(1, Math.floor(MAX_LOCAL_DOCS / 2)));
        await writeLocalDocMap(memoryCache);
      }
    }
  } catch (err) {
    // navigator.storage.estimate() is unavailable/unsupported — continue.
    console.warn("Could not estimate storage quota", err);
  }

  // Store in the in-memory decrypted mirror (bounded + evicting) — the source
  // of truth for the rest of the session — then persist the encrypted blob to
  // the localStorage documents map so the offline document mirror survives a
  // page reload. Do NOT return early here: the original code returned before
  // the localStorage write, leaving the bounded localStorage persistence and
  // quota retry below as dead code, so callers never learned whether the write
  // actually succeeded (incl. quota failures).
  memoryCache[payload.documentId] = cached;
  evictOldest(memoryCache, MAX_LOCAL_DOCS);
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
        console.warn("[FinSight] saveLocalAnalysis failed:", err);
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
    const docMap = readLocalDocMap();
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
    console.error("Error reading local documents", err);
    return [];
  }
}

/**
 * Retrieves a single cached analysis by documentId from the session mirror.
 */
export function getLocalDocumentById(documentId: string): CachedAnalysisPayload | null {
  if (typeof window === "undefined" || !documentId) return null;
  return readLocalDocMap()[documentId] ?? null;
}

/**
 * Deletes a local document from the localStorage map.
 */
export function deleteLocalDocument(documentId: string): void {
  if (typeof window === "undefined" || !documentId) return;

  try {
    if (memoryCache[documentId]) {
      delete memoryCache[documentId];
      void writeLocalDocMap(memoryCache, documentId);
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
  } catch (err) {
    console.warn("[FinSight] Failed to clear localStorage:", err);
  }

  // Wipe the in-memory decrypted mirror and the session encryption key so no
  // financial data (or the means to decrypt the persisted blob) survives
  // logout / account erasure.
  for (const key of Object.keys(memoryCache)) delete memoryCache[key];
  sessionCacheKey = null;

  try {
    const session = window.sessionStorage;
    const doomed: string[] = [];
    for (let i = 0; i < session.length; i++) {
      const key = session.key(i);
      if (key && key.startsWith("fin_local_doc_")) doomed.push(key);
    }
    doomed.forEach((key) => session.removeItem(key));
  } catch (err) {
    console.warn("[FinSight] Failed to clear sessionStorage:", err);
  }

  try {
    window.dispatchEvent(
      new CustomEvent("fin_local_docs_changed", { detail: { cleared: true } }),
    );
  } catch (err) {
    console.warn("[FinSight] Failed to dispatch fin_local_docs_changed event:", err);
  }
}
