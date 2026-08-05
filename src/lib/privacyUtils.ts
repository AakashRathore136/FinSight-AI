/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  getDoc,
  setDoc,
  deleteDoc,
  DocumentReference,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { format } from "date-fns";

export interface PrivacySettings {
  dataCollection: boolean;
  shareAnalytics: boolean;
  personalizedAds: boolean;
  thirdPartySharing: boolean;
  retentionPeriod: "6months" | "1year" | "2years" | "indefinite";
  exportFormat: "json" | "csv";
  lastUpdated: string;
  dataRetentionEnabled: boolean;
  analyticsEnabled: boolean;
  sharingEnabled: boolean;
  mfaEnabled: boolean;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  timestamp: Date;
  details: string;
  category: "auth" | "data" | "export" | "settings" | "deletion";
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  dataCollection: true,
  shareAnalytics: true,
  personalizedAds: false,
  thirdPartySharing: false,
  retentionPeriod: "1year",
  exportFormat: "json",
  lastUpdated: new Date().toISOString(),
  dataRetentionEnabled: false,
  analyticsEnabled: false,
  sharingEnabled: false,
  mfaEnabled: false,
};

export async function getPrivacySettings(
  userId: string,
): Promise<PrivacySettings> {
  try {
    const docRef = doc(db, "privacy_settings", userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as PrivacySettings;
    await setDoc(docRef, DEFAULT_PRIVACY_SETTINGS);
    return DEFAULT_PRIVACY_SETTINGS;
  } catch (err) {
    console.error("getPrivacySettings: failed to retrieve privacy settings", err);
    return DEFAULT_PRIVACY_SETTINGS;
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

export async function exportUserData(
  userId: string,
): Promise<Record<string, any>> {
  const data: Record<string, any> = {};
  for (const colName of [
    "transactions",
    "subscriptions",
    "anomalies",
    "reports",
    "trend_analysis",
  ]) {
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

export async function deleteUserData(userId: string): Promise<void> {
  // Write the deletion tombstone (users/<uid>.deletedAt) first so that
  // onAuthStateChanged cannot resurrect the profile even if a later step fails.
  const userRef = doc(db, "users", userId);
  try {
    const existing = await getDoc(userRef);
    const profile = existing.exists() ? existing.data() : {};
    await deleteDoc(userRef);
    await setDoc(userRef, {
      uid: userId,
      email: profile.email ?? auth.currentUser?.email ?? "",
      role:
        profile.role && profile.role !== "admin"
          ? profile.role
          : "junior_analyst",
      username: profile.username ?? "",
      deletedAt: new Date().toISOString(),
      deleted: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "users");
    throw error;
  }

  const batch = writeBatch(db);
  const docRefs: DocumentReference[] = [];
  for (const colName of [
    "transactions",
    "subscriptions",
    "anomalies",
    "reports",
    "trend_analysis",
    "goals",
  ]) {
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
  docRefs.push(doc(db, "users", userId));
  docRefs.push(doc(db, "privacy_settings", userId));
  docRefs.push(doc(db, "currencies", userId));
  try {
    batch.delete(doc(db, "privacy_settings", userId));
    batch.delete(doc(db, "currencies", userId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "userData");
    throw error;
  }
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
