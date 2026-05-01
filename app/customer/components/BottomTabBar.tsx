"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Package, CreditCard, User } from "lucide-react";
import { useEffect, useState } from "react";

export default function BottomTabBar() {
  const pathname = usePathname();
  const [isB2C, setIsB2C] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");
      if (raw) {
        const s = JSON.parse(raw);
        setIsB2C(s.customerType === "B2C");
      }
    } catch {}
  }, []);

  if (pathname === "/customer/login") return null;

  const tabs = [
    { href: "/customer/products", label: "Shop",    Icon: ShoppingBag },
    { href: "/customer/orders",   label: "Orders",  Icon: Package },
    { href: "/customer/wallet",   label: "Wallet",  Icon: CreditCard },
    { href: "/customer/profile",  label: "Profile", Icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-stretch">
        {tabs.map(({ href, label, Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                isActive ? "" : "text-gray-400 hover:text-gray-600"
              }`}
              style={isActive ? { color: "#1B2A5E" } : {}}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
