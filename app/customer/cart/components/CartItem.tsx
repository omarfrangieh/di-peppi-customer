"use client";

import { CartItem as CartItemType } from "../../lib/cart";
import { formatPrice } from "@/lib/formatters";
import useCart from "../../hooks/useCart";

interface CartItemProps {
  item: CartItemType;
  maxStock?: number;
}

export default function CartItem({ item, maxStock = Infinity }: CartItemProps) {
  const { updateQty, removeItem } = useCart();

  const lineTotal = item.priceAtTime * item.quantity;
  const atLimit = item.quantity >= maxStock;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Top row: product info + remove */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-grow min-w-0">
          <h3 className="font-semibold text-gray-900 leading-snug">{item.productName}</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            ${formatPrice(item.priceAtTime)} each
          </p>
          {atLimit && maxStock < Infinity && (
            <p className="text-xs font-medium mt-1" style={{ color: "#B5535A" }}>
              Only {maxStock} left in stock
            </p>
          )}
        </div>
        <button
          onClick={() => removeItem(item.productId)}
          className="flex-shrink-0 p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors cursor-pointer"
          title="Remove from cart"
        >
          🗑️
        </button>
      </div>

      {/* Bottom row: qty controls + line total */}
      <div className="flex items-center justify-between gap-3">
        {/* Quantity Controls */}
        <div className={`flex items-center border rounded-lg px-2 py-1 ${atLimit ? "border-red-300" : "border-gray-300"}`}>
          <button
            onClick={() => { if (item.quantity > 1) updateQty(item.productId, item.quantity - 1); }}
            disabled={item.quantity <= 1}
            className={`px-2 py-0.5 font-semibold rounded transition-colors text-base ${item.quantity <= 1 ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100 cursor-pointer"}`}
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={maxStock < Infinity ? maxStock : undefined}
            value={item.quantity}
            onChange={(e) => {
              const val = Math.max(1, Math.min(parseInt(e.target.value) || 1, maxStock < Infinity ? maxStock : Infinity));
              updateQty(item.productId, val);
            }}
            className="w-10 text-center text-sm font-semibold border-0 focus:ring-0"
          />
          <button
            onClick={() => {
              if (!atLimit) updateQty(item.productId, item.quantity + 1);
            }}
            disabled={atLimit}
            className={`px-2 py-0.5 font-semibold rounded transition-colors text-base ${atLimit ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100 cursor-pointer"}`}
          >
            +
          </button>
        </div>

        {/* Line Total */}
        <div className="text-right">
          <p className="text-base font-bold text-gray-900">${formatPrice(lineTotal)}</p>
          <p className="text-xs text-gray-500">{item.quantity} × ${formatPrice(item.priceAtTime)}</p>
        </div>
      </div>
    </div>
  );
}
