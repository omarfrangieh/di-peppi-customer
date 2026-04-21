import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCMFpPM5T2bjV0RB3P9DHYMddptgHsqph8",
  authDomain: "di-peppi.firebaseapp.com",
  projectId: "di-peppi",
  storageBucket: "di-peppi.firebasestorage.app",
  messagingSenderId: "895738595922",
  appId: "1:895738595922:web:8f1f8fa70c7ca9e0e47a98",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);

// Connect to emulators in development
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
  } catch (err) {
    // Emulators might already be connected, ignore error
  }
}

