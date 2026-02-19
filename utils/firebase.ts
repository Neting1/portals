import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBeY84OQNYSbhkHzGDkKod3pFTzDIpzOwQ",
  authDomain: "portal-8f01c.firebaseapp.com",
  projectId: "portal-8f01c",
  storageBucket: "portal-8f01c.firebasestorage.app",
  messagingSenderId: "540916886252",
  appId: "1:540916886252:web:7d34a9de090428913d53c9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);