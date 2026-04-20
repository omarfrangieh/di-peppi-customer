"use client";

import { CartItem } from "../../lib/cart";
import { formatPrice } from "@/lib/formatters";

interface CartSummaryProps {
  items: CartItem[];
  deliveryFee?: number;
  onCheckout: () => void;
  isLoading?: boolean;
}

export default function CartSummary({
  items,
  deliveryFee = 0,
  onCheckout,
  isLoading = false,
}: CartSummaryProps) {
  const subtotal = items.reduce((sum, item) => sum + item.priceAtTime * item.quantity, 0);
  const total = subtotal + deliveryFee;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 sticky top-20">
      {/* Subtotal */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Subtotal ({items.length} item{items.length !== 1 ? "s" : ""}):</span>
        <span className="font-semibold text-gray-900">${formatPrice(subtotal)}</span>
      </div>

      {/* Delivery Fee */}
      {deliveryFee > 0 && (
        <div className="flex justify-between text-sm border-t border-gray-200 pt-4">
          <span className="text-gray-600">Delivery Fee:</span>
          <span className="font-semibold text-gray-900">${formatPrice(deliveryFee)}</span>
        </div>
      )}

      {/* Total */}
      <div className="border-t border-gray-200 pt-4 flex justify-between">
        <span className="font-bold text-gray-900">Total:</span>
        <span className="text-2xl font-bold text-blue-600">${formatPrice(total)}</span>
      </div>

      {/* Checkout Button */}
      <button
        onClick={onCheckout}
        disabled={items.length === 0 || isLoading}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
      >
        {isLoading ? "Processing..." : "Proceed to Checkout"}
      </button>

      {/* Continue Shopping Link */}
      <button
        onClick={() => window.location.href = "/customer/products"}
        className="w-full py-2 text-gray-600 hover:text-blue-600 font-semibold text-sm transition-colors"
      >
        Continue Shopping
      </button>
    </div>
  );
}
