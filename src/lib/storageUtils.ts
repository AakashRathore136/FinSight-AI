/* eslint-disable @typescript-eslint/no-explicit-any */

const LOCAL_DOCS_KEY = "fin_local_documents_v1";

export interface CachedAnalysisPayload {
  documentId: string;
  record: any;
  analysis: any;
  persistenceMode?: string;
  storedAt?: string;
}

/**
 * Persists an analysis result locally in both localStorage (for long-term persistence across tabs/sessions)
 * and sessionStorage (for instant retrieval).
 */
export function saveLocalAnalysis(payload: CachedAnalysisPayload): void {
  if (typeof window === "undefined" || !payload?.documentId) return;

  const now = new Date().toISOString();
  const cached: CachedAnalysisPayload = {
    documentId: payload.documentId,
    record: payload.record || null,
    analysis: payload.analysis || null,
    persistenceMode: payload.persistenceMode || "local",
    storedAt: now,
  };

  // 1. Store in sessionStorage for fast session retrieval
  try {
    window.sessionStorage.setItem(
      `fin_local_doc_${payload.documentId}`,
      JSON.stringify(cached),
    );
  } catch (err) {
    console.warn("Could not cache in sessionStorage", err);
  }

  // 2. Store in localStorage documents map
  try {
    const rawMap = window.localStorage.getItem(LOCAL_DOCS_KEY);
    const docMap: Record<string, CachedAnalysisPayload> = rawMap
      ? JSON.parse(rawMap)
      : {};

    docMap[payload.documentId] = cached;
    window.localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify(docMap));
    
    // Dispatch custom event so components can update reactively if needed
    window.dispatchEvent(new CustomEvent("fin_local_docs_changed", { detail: { documentId: payload.documentId } }));
  } catch (err) {
    console.warn("Could not cache in localStorage", err);
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
    const rawMap = window.localStorage.getItem(LOCAL_DOCS_KEY);
    if (rawMap) {
      const docMap: Record<string, CachedAnalysisPayload> = JSON.parse(rawMap);
      delete docMap[documentId];
      window.localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify(docMap));
      window.dispatchEvent(new CustomEvent("fin_local_docs_changed", { detail: { documentId } }));
    }
  } catch (err) {
    console.error("Error removing local document", err);
  }
}
