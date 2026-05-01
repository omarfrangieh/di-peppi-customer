"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useCart from "../hooks/useCart";
import CartItem from "./components/CartItem";
import CartSummary from "./components/CartSummary";

export default function CartPage() {
  const router = useRouter();
  const { items, clear } = useCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [deliveryFee] = useState(0); // Could be fetched from customer profile

  // Ensure component is hydrated before rendering (for localStorage)
  useEffect(() => {
    setIsHydrated(true);
  }, []);

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Shopping Cart</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} in cart
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
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
                  <CartItem key={item.productId} item={item} />
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
