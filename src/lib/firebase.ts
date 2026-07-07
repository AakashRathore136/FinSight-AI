import { initializeApp, FirebaseError } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || ''),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ''),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || ''),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || ''),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || ''),
  measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''),
};

const firestoreDatabaseId = String(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const storage = getStorage(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}


export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const firebaseError = error instanceof FirebaseError ? error : null;
  const errInfo: FirestoreErrorInfo = {
    error: firebaseError
      ? firebaseError.message
      : error instanceof Error
        ? error.message
        : String(error),
    code: firebaseError?.code,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  console.warn("Firebase configuration is missing. Authentication and database features will be disabled until setup is complete.");
}
