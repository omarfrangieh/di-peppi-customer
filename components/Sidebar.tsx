"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, ShoppingCart, FileText, Package, Fish, Users, Building2, Menu, BarChart2 } from "lucide-react";

const NAV = [
  { label: "Dashboard",       href: "/",                      icon: LayoutDashboard },
  { label: "Orders",          href: "/admin/orders",          icon: ShoppingCart },
  { label: "Invoices",        href: "/invoices",              icon: FileText },
  { label: "Purchase Orders", href: "/admin/purchase-orders", icon: Package },
  { label: "Products",        href: "/admin/products",        icon: Fish },
  { label: "Customers",       href: "/admin/customers",       icon: Users },
  { label: "Suppliers",       href: "/admin/suppliers",       icon: Building2 },
  { label: "Reports",         href: "/reports",               icon: BarChart2 },
];

const W_OPEN = 192;
const W_CLOSED = 56;

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const w = open ? W_OPEN : W_CLOSED;

  return (
    <div className="flex-shrink-0" style={{ width: w, transition: "width 200ms" }}>
      <aside className="fixed left-0 top-0 h-full flex flex-col overflow-hidden"
        style={{ backgroundColor: "#1B2A5E", width: w, transition: "width 200ms", zIndex: 50 }}>

        {/* Header — hamburger always left */}
        <div className="flex items-center border-b border-white/10" style={{ height: 60 }}>
          <button onClick={() => setOpen(p => !p)}
            className="flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
            style={{ width: W_CLOSED, height: 60 }}>
            <Menu size={18} color="white" />
          </button>
          {open && (
            <div className="flex items-center gap-2 overflow-hidden pr-2">
              <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi"
                className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 flex-shrink-0" />
              <span className="text-white font-bold text-sm whitespace-nowrap"
                style={{ fontFamily: "var(--font-playfair)" }}>Di Peppi</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-hidden">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
            return (
              <Link key={href} href={href} title={!open ? label : ""}
                className={`flex items-center transition-colors text-sm font-medium ${
                  active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
                style={{ height: 44 }}>
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: W_CLOSED }}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                {open && <span className="whitespace-nowrap flex-1">{label}</span>}
                {open && active && <span className="w-1.5 h-1.5 rounded-full bg-white mr-3 flex-shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10" style={{ height: 44 }}>
          {open && (
            <div className="flex items-center h-full" style={{ paddingLeft: W_CLOSED }}>
              <span className="text-white/30 text-xs">Di Peppi v1.0</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
