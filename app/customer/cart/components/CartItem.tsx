"use client";

import { CartItem as CartItemType } from "../../lib/cart";
import { formatPrice } from "@/lib/formatters";
import useCart from "../../hooks/useCart";

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQty, removeItem } = useCart();

  const lineTotal = item.priceAtTime * item.quantity;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
      {/* Product Info */}
      <div className="flex-grow">
        <h3 className="font-semibold text-gray-900">{item.productName}</h3>
        <p className="text-sm text-gray-600 mt-1">
          ${formatPrice(item.priceAtTime)} each
        </p>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2 py-1">
        <button
          onClick={() => updateQty(item.productId, item.quantity - 1)}
          className="px-2 text-gray-600 hover:bg-gray-100 font-semibold"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1;
            updateQty(item.productId, val);
          }}
          className="w-12 text-center text-sm font-semibold border-0 focus:ring-0"
        />
        <button
          onClick={() => updateQty(item.productId, item.quantity + 1)}
          className="px-2 text-gray-600 hover:bg-gray-100 font-semibold"
        >
          +
        </button>
      </div>

      {/* Line Total */}
      <div className="text-right min-w-fit">
        <p className="text-lg font-bold text-gray-900">
          ${formatPrice(lineTotal)}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {item.quantity} × ${formatPrice(item.priceAtTime)}
        </p>
      </div>

      {/* Remove Button */}
      <button
        onClick={() => removeItem(item.productId)}
        className="ml-4 p-2 hover:bg-red-50 rounded-lg text-red-600 hover:text-red-700 transition-colors"
        title="Remove from cart"
      >
        🗑️
      </button>
    </div>
  );
}
