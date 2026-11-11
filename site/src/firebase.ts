/**
 * Firebase setup (Spark plan: Auth + Firestore only — no Storage, Functions or Hosting).
 *
 * Paste your web app config below (Firebase console → Project settings → Your apps).
 * This config is public by design; data is protected by firestore.rules.
 */
import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAMqVD-nwWxvsLDJrRe0FA0upzYqiXx_6U",
  authDomain: "orezdeck.firebaseapp.com",
  projectId: "orezdeck",
  storageBucket: "orezdeck.firebasestorage.app",
  messagingSenderId: "862021374550",
  appId: "1:862021374550:web:79c544ac26f9f9bb2821f7",
  measurementId: "G-C7YYVP8N7G",
};

export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith("REPLACE");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Offline persistence: everything read once is cached in IndexedDB, so you can
 * study without reception and repeat visits read from cache (saves quota).
 * Writes made offline are queued and synced when the connection returns.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  ignoreUndefinedProperties: true,
});
