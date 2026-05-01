"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/formatters";

interface QuantitySelectorProps {
  price: number;
  maxQuantity: number;
  onQuantityChange: (qty: number) => void;
  onAddToCart: (qty: number) => void;
  isLoading?: boolean;
}

export default function QuantitySelector({
  price,
  maxQuantity,
  onQuantityChange,
  onAddToCart,
  isLoading = false,
}: QuantitySelectorProps) {
  const [quantity, setQuantity] = useState(1);

  const handleQuantityChange = (newQty: number) => {
    if (newQty < 1) newQty = 1;
    if (newQty > maxQuantity) newQty = maxQuantity;
    setQuantity(newQty);
    onQuantityChange(newQty);
  };

  const handleAddToCart = () => {
    onAddToCart(quantity);
  };

  const lineTotal = price * quantity;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Quantity Input */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Quantity
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleQuantityChange(quantity - 1)}
            disabled={quantity === 1}
            className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-lg font-semibold"
          >
            −
          </button>

          <input
            type="number"
            min={1}
            max={maxQuantity}
            value={quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              handleQuantityChange(val);
            }}
            className="w-20 text-center text-lg font-semibold border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />

          <button
            onClick={() => handleQuantityChange(quantity + 1)}
            disabled={quantity >= maxQuantity}
            className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-lg font-semibold"
          >
            +
          </button>
        </div>
      </div>

      {/* Line Total */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Unit Price:</span>
          <span className="font-semibold text-gray-900">${formatPrice(price)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Quantity:</span>
          <span className="font-semibold text-gray-900">{quantity}</span>
        </div>
        <div className="border-t border-gray-200 pt-2 flex justify-between">
          <span className="font-semibold text-gray-900">Line Total:</span>
          <span className="text-lg font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(lineTotal)}</span>
        </div>
      </div>

      {/* Add to Cart Button */}
      <button
        onClick={handleAddToCart}
        disabled={isLoading || maxQuantity === 0}
        className="w-full py-3 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-semibold rounded-lg transition-opacity text-lg hover:opacity-90"
        style={{ backgroundColor: "#1B2A5E" }}
      >
        {isLoading ? "Adding..." : maxQuantity === 0 ? "Out of Stock" : "✓ Add to Cart"}
      </button>
    </div>
  );
}
