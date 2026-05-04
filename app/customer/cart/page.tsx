"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import useCart from "../hooks/useCart";
import CartItem from "./components/CartItem";
import CartSummary from "./components/CartSummary";

export default function CartPage() {
  const router = useRouter();
  const { items, clear } = useCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [deliveryFee] = useState(0);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Ensure component is hydrated before rendering (for localStorage)
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Fetch live stock for all cart items
  useEffect(() => {
    if (!isHydrated || items.length === 0) return;
    const fetchStock = async () => {
      try {
        const ids = items.map((i) => i.productId);
        // Firestore "in" query supports up to 30 items
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
        const map: Record<string, number> = {};
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(db, "products"), where("__name__", "in", chunk))
          );
          snap.forEach((d) => { map[d.id] = Number(d.data().currentStock ?? 0); });
        }
        setStockMap(map);
      } catch {}
    };
    fetchStock();
  }, [isHydrated, items]);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      router.push("/customer/checkout");
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Shopping Cart</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} in cart
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {items.length === 0 ? (
          /* Empty Cart */
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🛒</p>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-6">Add some products to get started!</p>
            <button
              onClick={() => router.push("/customer/products")}
              className="px-6 py-3 text-white font-semibold rounded-lg transition-colors cursor-pointer hover:opacity-90"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Browse Products
            </button>
          </div>
        ) : (
          /* Cart Items */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items List */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-4">
                  Order Summary
                </h2>
                {items.map((item) => (
                  <CartItem key={item.productId} item={item} maxStock={stockMap[item.productId] ?? Infinity} />
                ))}
              </div>
            </div>

            {/* Cart Summary Sidebar */}
            <div>
              <CartSummary
                items={items}
                deliveryFee={deliveryFee}
                onCheckout={handleCheckout}
                isLoading={isCheckingOut}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
