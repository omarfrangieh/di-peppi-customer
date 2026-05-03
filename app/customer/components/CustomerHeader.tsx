"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import useCart from "../hooks/useCart";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, ChevronDown, Package, CreditCard, User, LogOut, ShoppingBag } from "lucide-react";
import NotificationBell from "./NotificationBell";

export default function CustomerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { items } = useCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsHydrated(true);
    try {
      const raw = localStorage.getItem("session");
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (pathname === "/customer/login") return null;

  const cartCount = isHydrated ? items.reduce((sum, i) => sum + i.quantity, 0) : 0;
  const isB2C = session?.customerType === "B2C";
  const initials = (session?.name || session?.email || "?").charAt(0).toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem("session");
    localStorage.removeItem("customToken");
    localStorage.removeItem("di-peppi-cart");
    router.push("/customer/login");
  };

  const desktopNav = [
    { href: "/customer/products", label: "Products", Icon: ShoppingBag },
    { href: "/customer/orders",   label: "Orders",   Icon: Package },
    { href: "/customer/wallet",   label: "Wallet",   Icon: CreditCard },
    { href: "/customer/profile",  label: "Profile",  Icon: User },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/customer/products" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
          <img
            src="/Di-Peppi-White-Background.jpg"
            alt="Di Peppi"
            className="w-10 h-10 rounded-xl object-contain border border-gray-200"
          />
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: "#1B2A5E" }}>Di Peppi</p>
            <p className="text-[9px] text-gray-400 leading-tight font-medium tracking-wider uppercase">Online Shop</p>
          </div>
        </Link>

        {/* Desktop center nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {desktopNav.map(({ href, label, Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                style={isActive ? { backgroundColor: "#1B2A5E" } : {}}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Notifications + Cart + Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notification Bell */}
          <NotificationBell />

          {/* Cart */}
          <button
            onClick={() => router.push("/customer/cart")}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Cart"
          >
            <ShoppingCart size={20} style={{ color: "#1B2A5E" }} />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </button>

          {/* Avatar dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: "#1B2A5E" }}
              >
                {initials}
              </span>
              <ChevronDown size={13} className={`text-gray-400 transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
                {/* User info */}
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{session?.name || "Customer"}</p>
                  <p className="text-xs text-gray-400 truncate">{session?.email}</p>
                </div>

                {/* Menu items */}
                {[
                  { href: "/customer/orders",  label: "My Orders", Icon: Package },
                  { href: "/customer/wallet",  label: "Wallet",    Icon: CreditCard },
                  { href: "/customer/profile", label: "Profile",   Icon: User },
                ].map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Icon size={15} className="text-gray-400" />
                    {label}
                  </Link>
                ))}

                <div className="border-t border-gray-100 mt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <LogOut size={15} />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
