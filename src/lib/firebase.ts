import { initializeApp, FirebaseError } from "firebase/app";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  runTransaction,
  doc,
  Transaction,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Fail loudly when required Firebase config is missing instead of silently
// falling back to a real production project.
const REQUIRED_FIREBASE_KEYS: (keyof typeof firebaseConfig)[] = [
  "apiKey",
  "projectId",
  "appId",
];
const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter((k) => !firebaseConfig[k]);
if (missingFirebaseKeys.length > 0) {
  throw new Error(
    `Missing required Firebase configuration: ${missingFirebaseKeys.join(
      ", ",
    )}. Set the corresponding VITE_FIREBASE_* environment variables before building.`,
  );
}

if (process.env.NODE_ENV !== "production") {
  console.log("[Firebase] Config loaded:", {
    apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 8) + "..." : "MISSING",
    authDomain: firebaseConfig.authDomain || "MISSING",
    projectId: firebaseConfig.projectId || "MISSING",
    appId: firebaseConfig.appId ? "set" : "MISSING",
  });
}

const firestoreDatabaseId = String(
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)",
);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const storage = getStorage(app);
export const analytics =
  typeof window !== "undefined" && firebaseConfig.measurementId
    ? (() => {
        try {
          return getAnalytics(app);
        } catch (e) {
          console.warn("Analytics initialization skipped:", e);
          return null;
        }
      })()
    : null;

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
  BUDGET = "budget",
}

export interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
  authInfo?: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface UserFriendlyError {
  title: string;
  description: string;
}

const ERROR_MESSAGES: Record<string, UserFriendlyError> = {
  "permission-denied": {
    title: "Access denied",
    description:
      "You do not have permission to view this data. Please sign in or contact support.",
  },
  "not-found": {
    title: "Data not found",
    description: "The requested record could not be found.",
  },
  "already-exists": {
    title: "Duplicate entry",
    description: "A record with this identifier already exists.",
  },
  "resource-exhausted": {
    title: "Quota exceeded",
    description:
      "Firestore read quota has been reached. Please try again later.",
  },
  "unauthenticated": {
    title: "Not signed in",
    description: "Please sign in to continue.",
  },
  "cancelled": {
    title: "Operation cancelled",
    description: "The requested operation was cancelled. Please try again.",
  },
  "deadline-exceeded": {
    title: "Request timed out",
    description:
      "The operation took too long. Please check your connection and try again.",
  },
  "internal": {
    title: "Internal error",
    description:
      "An internal error occurred. Please try again in a few minutes.",
  },
  "unknown": {
    title: "Unknown error",
    description: "An unexpected error occurred. Please try again.",
  },
};

const GENERIC_ERROR: UserFriendlyError = {
  title: "Something went wrong",
  description: "An error occurred while accessing data. Please try again.",
};

/**
 * Translates a Firebase error code into a user-friendly title and description.
 * Components can use this to display consistent, readable error messages
 * instead of raw Firebase error messages.
 */
export function getUserFriendlyError(error: unknown): UserFriendlyError {
  if (!(error instanceof FirebaseError)) {
    return GENERIC_ERROR;
  }
  return ERROR_MESSAGES[error.code] ?? GENERIC_ERROR;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const firebaseError = error instanceof FirebaseError ? error : null;
  
  // 1. Create the clean object without authInfo
  const errInfo = {
    error: firebaseError
      ? firebaseError.message
      : error instanceof Error
        ? error.message
        : String(error),
    code: firebaseError?.code,
    operationType,
    path,
  };

  // 2. The new development-only safe logging logic
  if (process.env.NODE_ENV === "development") {
    console.error("Firestore Error: ", JSON.stringify({
      code: firebaseError?.code,
      operationType,
      path,
      hasUser: !!auth.currentUser
    }));
  }

  // 3. Return the sanitized error
  return errInfo;
}

/**
 * Safely fetches a valid Firebase ID token with optional forced renewal on 401 unauthenticated errors.
 */
export async function getValidIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.error("Failed to retrieve or refresh Firebase ID token:", err);
    return null;
  }
}

/**
 * Runs a Firestore transaction with exponential backoff retries to prevent race conditions
 * and handle concurrent write collisions safely.
 */
export async function runAtomicTransactionWithRetry<T>(
  updateFn: (transaction: Transaction) => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 100,
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await runTransaction(db, updateFn);
    } catch (error: any) {
      attempt++;
      const isCollision =
        error?.code === "failed-precondition" ||
        error?.code === "aborted" ||
        error?.message?.includes("transaction");

      if (isCollision && attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        console.warn(`[Firestore Concurrency] Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Transaction failed after ${maxRetries} max retries due to concurrent write contention.`);
}

/**
 * Atomically validates and increments a user's monthly document analysis quota.
 * Prevents race conditions when uploading multiple documents simultaneously.
 */
export async function incrementUserQuotaAtomic(
  userId: string,
  monthlyLimit = 50,
): Promise<{ success: boolean; currentQuota: number; remainingQuota: number }> {
  return runAtomicTransactionWithRetry(async (transaction) => {
    const userRef = doc(db, "users", userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      throw new Error(`User account record [${userId}] not found.`);
    }

    const userData = userSnap.data();
    const currentQuota = Number(userData.documentsAnalyzedThisMonth || 0);

    if (currentQuota >= monthlyLimit) {
      throw new Error(`Monthly analysis quota limit reached (${monthlyLimit} documents max).`);
    }

    const newQuota = currentQuota + 1;
    transaction.update(userRef, {
      documentsAnalyzedThisMonth: newQuota,
      lastQuotaUpdateAt: serverTimestamp(),
    });

    return {
      success: true,
      currentQuota: newQuota,
      remainingQuota: monthlyLimit - newQuota,
    };
  });
}

/**
 * Performs version-controlled document state transition with optimistic concurrency locking.
 */
export async function updateDocumentStateAtomic(
  docId: string,
  updates: Record<string, any>,
  expectedVersion?: number,
): Promise<{ docId: string; version: number }> {
  return runAtomicTransactionWithRetry(async (transaction) => {
    const docRef = doc(db, "documents", docId);
    const docSnap = await transaction.get(docRef);

    if (!docSnap.exists()) {
      throw new Error(`Document record [${docId}] not found.`);
    }

    const currentData = docSnap.data();
    const currentVersion = Number(currentData.version || 1);

    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new Error(
        `Optimistic lock failure: Document version mismatch (expected: ${expectedVersion}, actual: ${currentVersion}).`,
      );
    }

    const nextVersion = currentVersion + 1;
    transaction.update(docRef, {
      ...updates,
      version: nextVersion,
      updatedAt: serverTimestamp(),
    });

    return { docId, version: nextVersion };
  });
}