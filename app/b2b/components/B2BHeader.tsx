"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import useB2BCart from "../hooks/useCart";
import { useState, useEffect } from "react";
import { BookOpen, Package, Building2, ShoppingCart, LogOut } from "lucide-react";

export default function B2BHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { items } = useB2BCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    try {
      const session = localStorage.getItem("b2b-session");
      if (session) {
        const parsed = JSON.parse(session);
        setCompanyName(parsed.companyName || parsed.name || parsed.email || null);
      }
    } catch {}
  }, []);

  if (pathname === "/b2b/login") return null;

  const cartCount = isHydrated ? items.reduce((sum, i) => sum + i.quantity, 0) : 0;

  const navLinks = [
    { href: "/b2b/products", label: "Catalogue", Icon: BookOpen },
    { href: "/b2b/orders",   label: "My Orders", Icon: Package },
    { href: "/b2b/profile",  label: "Account",   Icon: Building2 },
  ];

  const handleLogout = () => {
    localStorage.removeItem("b2b-session");
    localStorage.removeItem("b2b-customToken");
    localStorage.removeItem("di-peppi-b2b-cart");
    router.push("/b2b/login");
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo + B2B badge */}
        <Link href="/b2b" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
          <img
            src="/Di-Peppi-White-Background.jpg"
            alt="Di Peppi"
            className="w-9 h-9 rounded-lg object-contain border border-gray-200"
          />
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold leading-tight" style={{ color: "#1B2A5E" }}>Di Peppi</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white uppercase tracking-wide" style={{ backgroundColor: "#1B2A5E" }}>B2B</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-tight font-medium tracking-wide uppercase">Trade Portal</p>
          </div>
        </Link>

        {/* Center Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                style={isActive ? { backgroundColor: "#1B2A5E" } : {}}
              >
                <link.Icon size={15} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {companyName && (
            <span className="hidden lg:flex items-center gap-1 text-xs text-gray-500 max-w-[140px] truncate border border-gray-200 px-2 py-1 rounded-lg bg-gray-50">
              <Building2 size={11} /> {companyName}
            </span>
          )}

          <button
            onClick={() => router.push("/b2b/cart")}
            className="relative flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-semibold rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            <ShoppingCart size={15} />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t border-gray-100 px-4 py-2 flex gap-1">
        {navLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
                isActive ? "text-white" : "text-gray-600"
              }`}
              style={isActive ? { backgroundColor: "#1B2A5E" } : {}}
            >
              <link.Icon size={14} />
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
