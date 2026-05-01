"use client";

import { useState, useEffect } from "react";
import { Building2, Package, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";

export default function B2BProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem("b2b-session");
    if (!raw) { router.push("/b2b/login"); return; }
    try { setSession(JSON.parse(raw)); } catch { router.push("/b2b/login"); }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("b2b-session");
    localStorage.removeItem("b2b-customToken");
    localStorage.removeItem("di-peppi-b2b-cart");
    router.push("/b2b/login");
  };

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Account Settings</h1>

        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: "#1B2A5E" }}>
              <Building2 size={26} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{session.companyName || session.name}</h2>
              <p className="text-sm text-gray-500">{session.email}</p>
              <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded text-white uppercase" style={{ backgroundColor: "#1B2A5E" }}>B2B Account</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">Company</span>
              <span className="text-sm font-medium text-gray-900">{session.companyName || "—"}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">Contact</span>
              <span className="text-sm font-medium text-gray-900">{session.name || "—"}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">Email</span>
              <span className="text-sm font-medium text-gray-900">{session.email}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-sm text-gray-500">Account Type</span>
              <span className="text-sm font-medium text-gray-900">B2B Trade</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Quick Links</h3>
          <div className="space-y-2">
            <button onClick={() => router.push("/b2b/orders")} className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 border border-gray-100 text-sm text-gray-700 flex justify-between items-center transition-colors">
              <span className="flex items-center gap-2"><Package size={14} /> Order History</span> <span className="text-gray-400">›</span>
            </button>
            <button onClick={() => router.push("/b2b/products")} className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 border border-gray-100 text-sm text-gray-700 flex justify-between items-center transition-colors">
              <span className="flex items-center gap-2"><BookOpen size={14} /> Browse Catalogue</span> <span className="text-gray-400">›</span>
            </button>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full py-3 border border-red-200 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
