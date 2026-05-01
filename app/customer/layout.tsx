"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import CustomerHeader from "./components/CustomerHeader";
import BottomTabBar from "./components/BottomTabBar";
import HelpButton from "./components/HelpButton";
import { useSession } from "@/lib/useSession";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading } = useSession();

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
