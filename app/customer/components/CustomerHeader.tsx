"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function CustomerHeader() {
  const router = useRouter();
  const pathname = usePathname();

  // Hide header on login page
  if (pathname === "/customer/login") {
    return null;
  }

  const isHome = pathname === "/customer" || pathname === "/customer/";

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Left: Logo + Home Link */}
        <Link href="/customer" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img
            src="/Di-Peppi-White-Background.jpg"
            alt="Di Peppi Logo"
            className="w-10 h-10 rounded-lg object-contain bg-gray-100 p-1"
          />
          <span className="text-xl font-bold text-gray-900 hidden sm:inline">Di Peppi</span>
        </Link>

        {/* Center: Page Title */}
        <div className="flex-1 ml-6">
          {!isHome && (
            <h1 className="text-lg font-semibold text-gray-900">
              {pathname.includes("/products") && !pathname.includes("/products/")
                ? "Browse Products"
                : pathname.includes("/products/")
                ? "Product Details"
                : pathname.includes("/cart")
                ? "Shopping Cart"
                : pathname.includes("/checkout")
                ? "Checkout"
                : pathname.includes("/orders") && !pathname.includes("/orders/")
                ? "Order History"
                : pathname.includes("/orders/")
                ? "Order Details"
                : pathname.includes("/wallet")
                ? "Wallet"
                : pathname.includes("/profile")
                ? "Profile Settings"
                : "Online Shop"}
            </h1>
          )}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              onClick={() => router.push("/customer")}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-semibold transition-colors"
              title="Back to Home"
            >
              🏠 Home
            </button>
          )}
          <button
            onClick={() => router.push("/customer/cart")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
            title="View Shopping Cart"
          >
            🛒 Cart
          </button>
        </div>
      </div>
    </header>
  );
}
