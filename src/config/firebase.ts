/**
 * TripTrack Firebase Configuration
 *
 * Uses the Firebase JavaScript SDK for:
 * - Firebase Authentication
 * - Cloud Firestore
 * - Firebase Storage
 *
 * Firebase client configuration is supplied through Expo
 * EXPO_PUBLIC_* environment variables.
 *
 * IMPORTANT:
 * Do NOT place Firebase Admin credentials, service-account
 * private keys, APNs private keys, or other server secrets here.
 */

import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';

import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';

import {
  getFirestore,
  type Firestore,
} from 'firebase/firestore';

import {
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage';

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Ensures a required Expo environment variable exists.
 *
 * We intentionally fail fast instead of silently falling back
 * to fake/demo Firebase credentials.
 */
function requireEnv(
  name: string,
  value: string | undefined
): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[TripTrack Firebase] Missing environment variable: ${name}. ` +
        `Check your .env file and restart Expo with "npx expo start --clear".`
    );
  }

  return value.trim();
}

/**
 * Firebase Web/JS SDK configuration.
 *
 * These values will come from the Firebase Web App
 * configuration that you created in Firebase Console.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: requireEnv(
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY
  ),

  authDomain: requireEnv(
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
  ),

  projectId: requireEnv(
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
  ),

  storageBucket: requireEnv(
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
  ),

  messagingSenderId: requireEnv(
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),

  appId: requireEnv(
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID
  ),
};

/**
 * Initialize Firebase App.
 *
 * getApps()/getApp() prevents duplicate Firebase app
 * initialization during Expo Fast Refresh / HMR.
 */
const app: FirebaseApp =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

/**
 * Firebase Authentication
 *
 * React Native authentication persistence is backed by
 * AsyncStorage so the user session can survive app restarts.
 */
let auth: Auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error: unknown) {
  /**
   * During Fast Refresh, Firebase Auth may already have
   * been initialized. In that specific case reuse it.
   *
   * Any other initialization error is re-thrown instead
   * of silently hiding a Firebase configuration problem.
   */
  const firebaseError = error as {
    code?: string;
    message?: string;
  };

  if (firebaseError.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

/**
 * Cloud Firestore
 */
const db: Firestore = getFirestore(app);

/**
 * Firebase Storage
 */
const storage: FirebaseStorage = getStorage(app);

/**
 * Useful non-sensitive project identifier for diagnostics.
 *
 * Do not log coordinates, push tokens, authentication tokens,
 * or other private user information in production.
 */
const firebaseProjectId = firebaseConfig.projectId as string;

export {
  app,
  auth,
  db,
  storage,
  firebaseProjectId,
};