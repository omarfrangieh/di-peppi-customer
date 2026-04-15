"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV = [
  { label: "Dashboard",       href: "/",                      icon: "📊" },
  { label: "Orders",          href: "/admin/orders",          icon: "🛒" },
  { label: "Invoices",        href: "/invoices",              icon: "🧾" },
  { label: "Purchase Orders", href: "/admin/purchase-orders", icon: "📦" },
  { label: "Products",        href: "/admin/products",        icon: "🐟" },
  { label: "Customers",       href: "/admin/customers",       icon: "👥" },
  { label: "Suppliers",       href: "/admin/suppliers",       icon: "🏭" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-48 flex flex-col z-50"
      style={{ backgroundColor: "#1B2A5E" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi"
          className="w-9 h-9 rounded-lg object-contain flex-shrink-0 bg-white p-0.5" />
        <span className="text-white font-semibold text-sm">Di Peppi</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV.map(({ label, href, icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                active ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}>
              <span className="text-lg flex-shrink-0">{icon}</span>
              {label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-white/30">Di Peppi v1.0</p>
      </div>
    </aside>
  );
}
