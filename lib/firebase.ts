import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "di-peppi",
  storageBucket: "di-peppi.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
};

console.log("Firebase config:", firebaseConfig);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
