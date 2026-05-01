"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useB2BCart from "../hooks/useCart";
import { formatPrice } from "@/lib/formatters";

export default function B2BCartPage() {
  const router = useRouter();
  const { items, removeItem, updateQty, clear, getSubtotal } = useB2BCart();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const subtotal = getSubtotal();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Order Cart</h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} item{items.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => router.push("/b2b/products")}
            className="text-sm font-medium px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ← Continue Shopping
          </button>
        </div>

        {items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
            <p className="text-4xl mb-4">🛒</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h2>
            <p className="text-sm text-gray-500 mb-6">Add products from the catalogue to start your order</p>
            <button
              onClick={() => router.push("/b2b/products")}
              className="px-6 py-2.5 text-white font-semibold rounded-xl hover:opacity-90 transition-colors text-sm"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Browse Catalogue
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="font-semibold text-gray-900 text-sm">Order Items</h2>
                  <button onClick={clear} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Clear all</button>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <div key={item.productId} className="px-5 py-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm truncate">{item.productName}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">${formatPrice(item.priceAtTime)} / {item.unit}</p>
                        {item.caseSize && item.caseSize > 1 && (
                          <p className="text-xs text-gray-400 mt-0.5">📦 Case: {item.caseSize} units</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                          <button
                            onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 text-sm font-bold"
                          >−</button>
                          <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[40px] text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 text-sm font-bold"
                          >+</button>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <p className="font-semibold text-gray-900 text-sm">${formatPrice(item.priceAtTime * item.quantity)}</p>
                        </div>
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="text-gray-300 hover:text-red-500 transition-colors ml-1 text-lg leading-none"
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-32">
                <h2 className="font-semibold text-gray-900 mb-4 text-sm">Order Summary</h2>
                <div className="space-y-2 mb-4">
                  {items.map((item) => (
                    <div key={item.productId} className="flex justify-between text-xs text-gray-600">
                      <span className="truncate mr-2">{item.productName} ×{item.quantity}</span>
                      <span className="font-medium shrink-0">${formatPrice(item.priceAtTime * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900 text-sm">Subtotal</span>
                    <span className="text-xl font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(subtotal)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Delivery fee calculated at checkout</p>
                </div>
                <button
                  onClick={() => router.push("/b2b/checkout")}
                  className="w-full py-3 text-white font-bold rounded-xl text-sm transition-colors hover:opacity-90"
                  style={{ backgroundColor: "#1B2A5E" }}
                >
                  Proceed to Checkout →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
