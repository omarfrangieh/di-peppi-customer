"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useCart from "./hooks/useCart";

interface Customer {
  name: string;
  email: string;
}

export default function CustomerHomePage() {
  const router = useRouter();
  const { items } = useCart();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    const session = localStorage.getItem("session");
    if (!session) {
      router.push("/customer/login");
      return;
    }

    try {
      const parsedSession = JSON.parse(session);
      setCustomer({
        name: parsedSession.name || parsedSession.email,
        email: parsedSession.email,
      });
    } catch (err) {
      console.error("Error parsing session:", err);
      router.push("/customer/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("session");
    localStorage.removeItem("customToken");
    localStorage.removeItem("di-peppi-cart");
    router.push("/customer/login");
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const menuItems = [
    {
      title: "Browse Products",
      description: "View our fresh product catalog",
      icon: "🛍️",
      href: "/customer/products",
      color: "from-blue-500 to-blue-600",
    },
    {
      title: "Shopping Cart",
      description: `${items.length} item${items.length !== 1 ? "s" : ""} in cart`,
      icon: "🛒",
      href: "/customer/cart",
      color: "from-purple-500 to-purple-600",
      badge: items.length > 0 ? items.length : null,
    },
    {
      title: "Order History",
      description: "View your past orders",
      icon: "📦",
      href: "/customer/orders",
      color: "from-green-500 to-green-600",
    },
    {
      title: "Wallet",
      description: "Check your wallet balance",
      icon: "💳",
      href: "/customer/wallet",
      color: "from-yellow-500 to-orange-600",
    },
    {
      title: "Profile Settings",
      description: "Manage your account",
      icon: "⚙️",
      href: "/customer/profile",
      color: "from-pink-500 to-red-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/Di-Peppi-White-Background.jpg"
              alt="Di Peppi Logo"
              className="w-10 h-10 rounded-lg object-contain"
            />
            <h1 className="text-xl font-bold text-gray-900">Online Shop</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {customer?.name}!
          </h2>
          <p className="text-gray-600">{customer?.email}</p>
        </div>

        {/* Quick Menu Grid */}
        <h3 className="text-xl font-semibold text-gray-900 mb-6">What would you like to do?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={`relative bg-gradient-to-br ${item.color} rounded-lg p-8 text-white cursor-pointer hover:shadow-xl transition-shadow h-full`}>
                {item.badge && (
                  <div className="absolute top-4 right-4 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                    {item.badge}
                  </div>
                )}
                <p className="text-5xl mb-4">{item.icon}</p>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-white text-opacity-90 text-sm">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Features Section */}
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Why Shop With Us?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition-all">
            <div className="text-4xl mb-3">🥬</div>
            <h3 className="font-semibold text-gray-900 mb-2">Fresh Products</h3>
            <p className="text-sm text-gray-600">
              Sourced fresh daily from trusted suppliers
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition-all">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="font-semibold text-gray-900 mb-2">Easy Ordering</h3>
            <p className="text-sm text-gray-600">
              Quick checkout with multiple payment options
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition-all">
            <div className="text-4xl mb-3">🚚</div>
            <h3 className="font-semibold text-gray-900 mb-2">Fast Delivery</h3>
            <p className="text-sm text-gray-600">
              Reliable delivery to your doorstep
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-12 text-center">
          <Link href="/customer/products">
            <button
              className="px-8 py-4 text-white rounded-lg font-semibold transition-all hover:shadow-lg text-lg"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Start Shopping Now
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
