/**
 * Offline Sync & Queue Manager for PWA & Firestore Cache Consistency
 * Manages pending offline mutations, detects network reconnection, and triggers sync notifications.
 */

import { toast } from "sonner";

export interface SyncState {
  isOnline: boolean;
  pendingWriteCount: number;
  lastSyncedAt: Date | null;
}

export type SyncStateListener = (state: SyncState) => void;

class OfflineSyncManager {
  private isOnline: boolean = typeof navigator !== "undefined" ? navigator.onLine : true;
  private pendingWriteCount: number = 0;
  private lastSyncedAt: Date | null = new Date();
  private listeners: Set<SyncStateListener> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline.bind(this));
      window.addEventListener("offline", this.handleOffline.bind(this));
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    toast.success("Network connection restored. Syncing pending changes...", {
      id: "offline-sync-toast",
    });
    this.notifyListeners();
  }

  private handleOffline(): void {
    this.isOnline = false;
    toast.warning("Working offline. Local edits will sync automatically when back online.", {
      id: "offline-sync-toast",
      duration: 5000,
    });
    this.notifyListeners();
  }

  public updatePendingWrites(count: number): void {
    const prevCount = this.pendingWriteCount;
    this.pendingWriteCount = Math.max(0, count);

    if (prevCount > 0 && this.pendingWriteCount === 0 && this.isOnline) {
      this.lastSyncedAt = new Date();
      toast.success("All offline changes synchronized successfully with cloud database.");
    }

    this.notifyListeners();
  }

  public getSyncState(): SyncState {
    return {
      isOnline: this.isOnline,
      pendingWriteCount: this.pendingWriteCount,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSyncState());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const state = this.getSyncState();
    this.listeners.forEach((listener) => listener(state));
  }
}

export const offlineSyncManager = new OfflineSyncManager();
