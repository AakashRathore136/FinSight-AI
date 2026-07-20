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
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { format } from "date-fns";

export interface PrivacySettings {
  dataCollection: boolean;
  shareAnalytics: boolean;
  personalizedAds: boolean;
  thirdPartySharing: boolean;
  retentionPeriod: "6months" | "1year" | "2years" | "indefinite";
  exportFormat: "json" | "csv";
  lastUpdated: string;
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
  } catch {
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
  } catch {
    handleFirestoreError(settings, OperationType.UPDATE, "privacy_settings");
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
    } catch {
      data[colName] = [];
    }
  }
  try {
    data.profile = (await getDoc(doc(db, "users", userId))).data();
  } catch {}
  return data;
}

export async function deleteUserData(userId: string): Promise<void> {
  const batch = writeBatch(db);
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
      ).docs.forEach((d) => batch.delete(d.ref));
    } catch {}
  }
  try {
    batch.delete(doc(db, "users", userId));
    batch.delete(doc(db, "privacy_settings", userId));
    batch.delete(doc(db, "currencies", userId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "userData");
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
