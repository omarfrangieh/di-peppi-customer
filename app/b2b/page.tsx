"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useB2BCart from "./hooks/useCart";

interface B2BSession {
  name: string;
  email: string;
  companyName?: string;
}

export default function B2BHomePage() {
  const router = useRouter();
  const { items } = useB2BCart();
  const [session, setSession] = useState<B2BSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    const raw = localStorage.getItem("b2b-session");
    if (!raw) { router.push("/b2b/login"); return; }
    try {
      const parsed = JSON.parse(raw);
      setSession({ name: parsed.name || parsed.email, email: parsed.email, companyName: parsed.companyName });
    } catch {
      router.push("/b2b/login");
    }
  }, [router]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const menuItems = [
    {
      title: "Product Catalogue",
      description: "Browse our full catalogue with wholesale pricing",
      icon: "📋",
      href: "/b2b/products",
      highlight: true,
    },
    {
      title: "Order Cart",
      description: cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? "s" : ""} ready to submit` : "Your cart is empty",
      icon: "🛒",
      href: "/b2b/cart",
      badge: cartCount > 0 ? cartCount : null,
    },
    {
      title: "Order History",
      description: "View and track all your business orders",
      icon: "📦",
      href: "/b2b/orders",
    },
    {
      title: "Account Settings",
      description: "Manage company info and preferences",
      icon: "🏢",
      href: "/b2b/profile",
    },
  ];

  const benefits = [
    { icon: "💰", title: "Wholesale Pricing", desc: "Exclusive B2B rates on all products" },
    { icon: "📄", title: "Invoice Terms", desc: "Net 30/60 day credit payment options" },
    { icon: "📦", title: "Bulk Ordering", desc: "Order by case with no minimum hassle" },
    { icon: "🧾", title: "VAT Invoices", desc: "Full tax documentation for every order" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="text-white px-6 py-10" style={{ backgroundColor: "#1B2A5E" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-white uppercase tracking-wide" style={{ color: "#1B2A5E" }}>B2B Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">{session?.companyName || session?.name}</h1>
            <p className="text-blue-300 text-sm">{session?.email}</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-blue-200 text-xs mb-1">Trade Account</p>
            <Link href="/b2b/products">
              <button className="px-5 py-2 bg-white text-sm font-bold rounded-xl hover:bg-blue-50 transition-colors" style={{ color: "#1B2A5E" }}>
                Browse Catalogue →
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Quick actions */}
        <h2 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={`relative bg-white border rounded-xl p-5 cursor-pointer hover:shadow-md transition-all group h-full ${
                item.highlight ? "border-blue-200 bg-blue-50/30" : "border-gray-200 hover:border-gray-300"
              }`}>
                {item.badge && (
                  <span className="absolute top-4 right-4 min-w-[24px] h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5">
                    {item.badge}
                  </span>
                )}
                <span className="text-3xl mb-3 block">{item.icon}</span>
                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-[#1B2A5E] transition-colors">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.description}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium" style={{ color: "#1B2A5E" }}>
                  Go <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Benefits */}
        <h2 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">Your B2B Benefits</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {benefits.map((b) => (
            <div key={b.title} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <span className="text-2xl mb-2 block">{b.icon}</span>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{b.title}</h3>
              <p className="text-xs text-gray-500">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
