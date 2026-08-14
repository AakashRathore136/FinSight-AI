/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  writeBatch,
  getDoc,
  setDoc,
  deleteDoc,
  type DocumentReference,
} from "firebase/firestore";
import { deleteObject, list, ref } from "firebase/storage";
import { db, auth, storage, handleFirestoreError, OperationType } from "./firebase";
import { DEFAULT_ROLE } from "./roleConstants";
import { clearAllLocalData } from "./storageUtils";
import { format } from "date-fns";

export interface PrivacySettings {
  userId?: string;
  dataRetentionEnabled: boolean;
  analyticsEnabled: boolean;
  sharingEnabled: boolean;
  mfaEnabled?: boolean;
  exportRequestedAt: string;
  deletionRequestedAt: string;
  updatedAt: string;
  lastUpdated?: string;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  timestamp: Date;
  details: string;
  category: "auth" | "data" | "export" | "settings" | "deletion";
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  dataRetentionEnabled: false,
  analyticsEnabled: false,
  sharingEnabled: false,
  exportRequestedAt: "",
  deletionRequestedAt: "",
  updatedAt: new Date().toISOString(),
};

export async function getPrivacySettings(
  userId: string,
): Promise<PrivacySettings> {
  try {
    const docRef = doc(db, "privacy_settings", userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      // Merge over the defaults so documents written before every field was
      // introduced still expose a complete, typed settings object.
      return { ...DEFAULT_PRIVACY_SETTINGS, ...snap.data() };
    }
    await setDoc(docRef, DEFAULT_PRIVACY_SETTINGS);
    return DEFAULT_PRIVACY_SETTINGS;
  } catch (err) {
    // Re-throw so callers can fall back to their offline cache instead of
    // silently presenting defaults that overwrite the user's saved choices.
    console.error("getPrivacySettings: failed to retrieve privacy settings", err);
    throw err;
  }
}

export async function updatePrivacySettings(
  userId: string,
  settings: Partial<PrivacySettings>,
): Promise<void> {
  try {
    await setDoc(
      doc(db, "privacy_settings", userId),
      { ...settings, lastUpdated: new Date().toISOString() },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, "privacy_settings");
  }
}

export async function fetchActivityLog(
  userId: string,
): Promise<ActivityLogEntry[]> {
  try {
    const logRef = collection(db, "activity_log");
    const q = query(logRef, where("userId", "==", userId), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    const entries: ActivityLogEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      entries.push({
        id: docSnap.id,
        action: data.action || "",
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
        details: data.details || "",
        category: data.category || "data",
      });
    });
    return entries;
  } catch (err) {
    console.error("fetchActivityLog: failed to retrieve activity log", err);
    return [];
  }
}

const USER_COLLECTIONS = [
  "transactions",
  "subscriptions",
  "anomalies",
  "reports",
  "trend_analysis",
  "goals",
  "challenges",
  "emergency_funds",
  "health_scores",
  "chat_conversations",
  "chat_messages",
  "budget_categories",
  "budget_rollovers",
  "budgets",
  "portfolioHoldings",
  "portfolioTransactions",
  "portfolios",
  "portfolioSnapshots",
  "forecasts",
  "tax_estimates",
  "bills",
  "activity_log",
];

export async function exportUserData(
  userId: string,
): Promise<Record<string, any>> {
  const data: Record<string, any> = {};
  for (const colName of USER_COLLECTIONS) {
    try {
      const snap = await getDocs(
        query(collection(db, colName), where("userId", "==", userId)),
      );
      data[colName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error('exportUserData: failed to fetch', colName, error);
      data[colName] = [];
    }
  }
  // documents are keyed by ownerId and keep their analyses as subcollections
  try {
    const docsSnap = await getDocs(
      query(collection(db, "documents"), where("ownerId", "==", userId)),
    );
    const documents: Record<string, unknown>[] = [];
    for (const d of docsSnap.docs) {
      const entry: Record<string, unknown> = { id: d.id, ...d.data() };
      try {
        const analysesSnap = await getDocs(
          query(
            collection(db, "documents", d.id, "analyses"),
            where("ownerId", "==", userId),
          ),
        );
        entry.analyses = analysesSnap.docs.map((a) => ({
          id: a.id,
          ...a.data(),
        }));
      } catch (error) {
        console.error('exportUserData: failed to fetch document analyses', error);
        entry.analyses = [];
      }
      documents.push(entry);
    }
    data.documents = documents;
  } catch (error) {
    console.error('exportUserData: failed to fetch documents', error);
    data.documents = [];
  }
  // The top-level analyses collection is keyed by ownerId (e.g. failed
  // upload attempts persisted from the client), so it is handled separately.
  try {
    const analysesSnap = await getDocs(
      query(collection(db, "analyses"), where("ownerId", "==", userId)),
    );
    data.analyses = analysesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('exportUserData: failed to fetch analyses', error);
    data.analyses = [];
  }
  try {
    data.profile = (await getDoc(doc(db, "users", userId))).data();
  } catch (error) {
    console.error('exportUserData: failed to fetch user profile', error);
  }
  return data;
}

const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function deleteInBatches(refs: DocumentReference[]): Promise<void> {
  for (const batchRefs of chunk(refs, BATCH_SIZE)) {
    const batch = writeBatch(db);
    batchRefs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function collectStoragePaths(
  prefixRef: ReturnType<typeof ref>,
  out: Set<string>,
): Promise<void> {
  // Use the paginated `list` API instead of `listAll`, which Firebase
  // documents as capped at 1000 results. A user with >1000 stored PDFs would
  // otherwise have the remainder silently truncated and orphaned after
  // account erasure (issue #1366).
  let pageToken: string | undefined;
  do {
    const result = await list(prefixRef, { maxResults: 1000, pageToken });
    result.items.forEach((item) => out.add(item.fullPath));
    for (const prefix of result.prefixes) {
      await collectStoragePaths(prefix, out);
    }
    pageToken = result.nextPageToken;
  } while (pageToken);
}

/**
 * Best-effort deletion of the user's stored PDFs under analyses/<uid>/,
 * including any orphaned objects not referenced by a Firestore document.
 * Failures are logged but never block the rest of the account erasure.
 */
async function deleteUserStorageFiles(userId: string): Promise<void> {
  const pathsToDelete = new Set<string>();
  try {
    await collectStoragePaths(ref(storage, `analyses/${userId}`), pathsToDelete);
  } catch (error) {
    console.error("deleteUserStorageFiles: failed to list storage prefix", error);
  }
  try {
    const docsSnap = await getDocs(
      query(collection(db, "documents"), where("ownerId", "==", userId)),
    );
    for (const d of docsSnap.docs) {
      const storagePath = d.data().storagePath as string | undefined;
      if (storagePath) pathsToDelete.add(storagePath);
    }
  } catch (error) {
    console.error("deleteUserStorageFiles: failed to enumerate documents", error);
  }
  for (const path of pathsToDelete) {
    try {
      await deleteObject(ref(storage, path));
      console.log("deleteUserStorageFiles: deleted", path);
    } catch (error: any) {
      if (error?.code !== "storage/object-not-found") {
        console.error("deleteUserStorageFiles: failed to delete", path, error);
      }
    }
  }
}

export async function deleteUserData(userId: string): Promise<void> {
  // Purge the device caches first: the local mirror holds full analysis
  // payloads (records + AI reports) that must not survive account erasure.
  clearAllLocalData(userId);
  // Write the deletion tombstone (users/<uid>.deletedAt) first so that
  // onAuthStateChanged cannot resurrect the profile even if a later step fails.
  const userRef = doc(db, "users", userId);
  try {
    const existing = await getDoc(userRef);
    const profile = existing.exists() ? existing.data() : {};
    await deleteDoc(userRef);
    // Tombstone recreate must use DEFAULT_ROLE — Firestore create rules
    // reject any privileged role, and deleted accounts must not retain
    // elevated clearance. (See #505 / firestore.rules users create)
    await setDoc(userRef, {
      uid: userId,
      email: profile.email ?? auth.currentUser?.email ?? "",
      role: DEFAULT_ROLE,
      username: profile.username ?? "",
      deletedAt: new Date().toISOString(),
      deleted: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "users");
    throw error;
  }

  // Delete the Firestore records first (retrying in batches), and only then
  // delete the user's stored PDFs in Storage. Erasure must be resilient: if a
  // Firestore batch fails and re-throws, Storage objects are not yet gone, so
  // surviving documents never point at deleted Storage objects and the
  // operation stays idempotent on retry (issue #1367).
  const docRefs: DocumentReference[] = [];
  for (const colName of USER_COLLECTIONS) {
    try {
      (
        await getDocs(
          query(collection(db, colName), where("userId", "==", userId)),
        )
      ).docs.forEach((d) => docRefs.push(d.ref));
    } catch (error) {
      console.error('deleteUserData: failed to delete', colName, error);
    }
  }
  // The top-level analyses collection is keyed by ownerId, so it is handled
  // separately from the userId-keyed USER_COLLECTIONS above.
  try {
    (
      await getDocs(
        query(collection(db, "analyses"), where("ownerId", "==", userId)),
      )
    ).docs.forEach((d) => docRefs.push(d.ref));
  } catch (error) {
    console.error('deleteUserData: failed to delete analyses', error);
  }
  // documents are keyed by ownerId and keep their analyses as subcollections
  try {
    const docsSnap = await getDocs(
      query(collection(db, "documents"), where("ownerId", "==", userId)),
    );
    for (const d of docsSnap.docs) {
      const analysesSnap = await getDocs(
        query(
          collection(db, "documents", d.id, "analyses"),
          where("ownerId", "==", userId),
        ),
      );
      analysesSnap.docs.forEach((a) => docRefs.push(a.ref));
      docRefs.push(d.ref);
    }
  } catch (error) {
    console.error('deleteUserData: failed to delete documents', error);
  }
  // The users/<uid> doc must survive erasure: it is the deletion tombstone.
  docRefs.push(doc(db, "privacy_settings", userId));
  docRefs.push(doc(db, "currencies", userId));
  try {
    await deleteInBatches(docRefs);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "userData");
    throw error;
  }

  // Only after the Firestore records have been removed (and any document refs
  // they carried are no longer needed) do we delete the stored PDFs in
  // Storage. A Storage failure here never leaves dangling Firestore
  // references; re-running deleteUserData re-enumerates Storage and retries.
  await deleteUserStorageFiles(userId);
}

export function downloadJSON(data: Record<string, any>, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatDate(date: Date | string): string {
  return format(date instanceof Date ? date : new Date(date), "PPpp");
}
