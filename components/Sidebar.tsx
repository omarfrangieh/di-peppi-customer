"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, ShoppingCart, FileText, Package, Fish,
  Users, Building2, Menu, X, BarChart2, Boxes, LogOut,
  UserCog, Lock, History, Tags,
} from "lucide-react";
import { useAuth } from "./AuthWrapper";

const NAV = [
  { label: "Dashboard",       href: "/admin",                 icon: LayoutDashboard },
  { label: "Orders",          href: "/admin/orders",          icon: ShoppingCart },
  { label: "Invoices",        href: "/invoices",              icon: FileText },
  { label: "Purchase Orders", href: "/admin/purchase-orders", icon: Package },
  { label: "Products",        href: "/admin/products",        icon: Fish },
  { label: "Categories",      href: "/admin/categories",      icon: Tags },
  { label: "Customers",       href: "/admin/customers",       icon: Users },
  { label: "Suppliers",       href: "/admin/suppliers",       icon: Building2 },
  { label: "Stock",           href: "/stock",                 icon: Boxes },
  { label: "Reports",         href: "/reports",               icon: BarChart2 },
  { label: "Users",           href: "/admin/users",           icon: UserCog },
  { label: "Audit Log",       href: "/admin/audit-log",       icon: History },
  { label: "Permissions",     href: "/admin/permissions",     icon: Lock },
];

const W_OPEN = 200;
const W_CLOSED = 56;
const BRAND = "#1B2A5E";

const LOGIN_PATHS = ["/login", "/admin/login", "/customer/login"];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { session, logout } = useAuth();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close when route changes (mobile nav tap)
  useEffect(() => {
    if (window.innerWidth < 768) setOpen(false);
  }, [pathname]);

  if (LOGIN_PATHS.some(p => pathname === p || pathname.startsWith(p))) return null;

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Space placeholder so main content doesn't slide under the sidebar */}
      <div
        className="flex-shrink-0 transition-all duration-200"
        style={{ width: open ? W_OPEN : W_CLOSED }}
      />

      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 h-screen flex flex-col z-50 transition-all duration-200"
        style={{ backgroundColor: BRAND, width: open ? W_OPEN : W_CLOSED }}
      >
        {/* Header */}
        <div
          className="flex items-center flex-shrink-0 border-b border-white/10"
          style={{ height: 60 }}
        >
          <button
            onClick={() => setOpen(o => !o)}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            className="flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0"
            style={{ width: W_CLOSED, height: 60 }}
          >
            {open ? <X size={18} color="white" /> : <Menu size={18} color="white" />}
          </button>

          {open && (
            <div className="flex items-center gap-2 overflow-hidden pr-3">
              <img
                src="/Di-Peppi-White-Background.jpg"
                alt="Di Peppi"
                className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 flex-shrink-0"
              />
              <span
                className="text-white font-bold text-sm whitespace-nowrap"
                style={{ fontFamily: "var(--font-playfair, serif)" }}
              >
                Di Peppi
              </span>
            </div>
          )}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 py-2 overflow-y-auto min-h-0 scrollbar-thin">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                title={!open ? label : undefined}
                className={`relative flex items-center transition-colors text-sm font-medium group ${
                  active
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                style={{ height: 44 }}
              >
                {/* Active left accent */}
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full bg-white" />
                )}

                {/* Icon */}
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: W_CLOSED }}
                >
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                </span>

                {/* Label */}
                {open && (
                  <span className="whitespace-nowrap flex-1 pr-3">{label}</span>
                )}

                {/* Tooltip when collapsed */}
                {!open && (
                  <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 text-xs text-white bg-gray-900 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/10 p-2 space-y-1">
          {open && session && (
            <div className="px-2 py-2 rounded-lg bg-white/10 mb-1">
              <p className="text-white text-xs font-semibold truncate">{session.name}</p>
              <p className="text-white/50 text-xs truncate capitalize">{session.role}</p>
            </div>
          )}

          {!open && session && (
            <div
              className="flex items-center justify-center mb-1"
              title={`${session.name} (${session.role})`}
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {(session.name || "?")[0].toUpperCase()}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            title={!open ? "Logout" : undefined}
            className="w-full flex items-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm py-2"
          >
            <span
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: W_CLOSED - 16 }}
            >
              <LogOut size={18} strokeWidth={1.75} />
            </span>
            {open && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
