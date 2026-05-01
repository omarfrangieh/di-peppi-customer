"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import CustomerHeader from "./components/CustomerHeader";
import BottomTabBar from "./components/BottomTabBar";
import HelpButton from "./components/HelpButton";
import { useSession } from "@/lib/useSession";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading } = useSession();

  // If Firebase Auth token refresh fails (403 from securetoken.googleapis.com),
  // the error callback fires. Clear the stale Firebase Auth state and our
  // localStorage session so the customer is sent to login to re-authenticate.
  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      () => { /* normal state change — no action needed */ },
      (error) => {
        // Auth error (e.g. token refresh 403) — clear stale state and redirect
        console.warn("Firebase Auth token error, clearing session:", error.message);
        signOut(auth).catch(() => {});
        localStorage.removeItem("session");
        router.replace("/customer/login");
      }
    );
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/customer/login");
    }
  }, [session, loading, router]);

  return (
    <>
      <CustomerHeader />
      {/* pb-16 reserves space for the mobile bottom tab bar */}
      <div className="pb-16 md:pb-0">
        {children}
      </div>
      <BottomTabBar />
      <HelpButton />
    </>
  );
}
