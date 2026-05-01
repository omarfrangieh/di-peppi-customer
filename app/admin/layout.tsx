"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useSession, isAdminSession } from "@/lib/useSession";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!isAdminSession(session)) {
      router.replace("/admin/login");
    }
  }, [session, loading, router]);

  // While reading localStorage, render nothing to avoid flash
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authorised — redirect is already in flight, show nothing
  if (!isAdminSession(session)) return null;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen min-w-0">{children}</main>
    </div>
  );
}
