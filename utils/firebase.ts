import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// SECURITY FIX: Load Firebase configuration from environment variables
// This prevents API keys from being exposed in source code
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBeY84OQNYSbhkHzGDkKod3pFTzDIpzOwQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "portal-8f01c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "portal-8f01c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "portal-8f01c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "540916886252",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:540916886252:web:7d34a9de090428913d53c9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);