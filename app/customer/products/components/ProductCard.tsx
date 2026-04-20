"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useCart from "../../hooks/useCart";
import { formatPrice, formatQty } from "@/lib/formatters";

interface Product {
  id: string;
  name: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number;
  productImage?: string;
  description?: string;
}

interface ProductCardProps {
  product: Product;
  onAddToCart?: () => void;
}

export default function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [showQuantitySelector, setShowQuantitySelector] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const stockStatus =
    product.currentStock === 0
      ? "Out of Stock"
      : product.currentStock < 5
      ? "Limited Stock"
      : "In Stock";

  const stockColor =
    product.currentStock === 0
      ? "text-red-600 bg-red-50"
      : product.currentStock < 5
      ? "text-orange-600 bg-orange-50"
      : "text-green-600 bg-green-50";

  const handleAddToCart = async () => {
    if (quantity > product.currentStock) {
      alert(`Only ${formatQty(product.currentStock)} available`);
      return;
    }

    setIsAdding(true);
    try {
      addItem({
        productId: product.id,
        productName: product.name,
        quantity,
        priceAtTime: product.price,
      });

      // Show success feedback
      setShowQuantitySelector(false);
      setQuantity(1);

      // Optional: Show toast notification
      alert(`${product.name} added to cart!`);

      onAddToCart?.();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
      {/* Image Container */}
      <div className="relative w-full h-48 bg-gray-100 flex-shrink-0">
        {product.productImage ? (
          <Image
            src={product.productImage}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-4xl">📦</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        {/* Product Name */}
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
          {product.name}
        </h3>

        {/* Origin */}
        {product.origin && (
          <p className="text-xs text-gray-500 mb-2">from {product.origin}</p>
        )}

        {/* Price */}
        <p className="text-lg font-bold text-gray-900 mb-2">
          ${formatPrice(product.price)}
        </p>

        {/* Stock Status */}
        <div className={`text-xs font-semibold px-2 py-1 rounded-full ${stockColor} mb-3 w-fit`}>
          {stockStatus}
        </div>

        {/* Unit */}
        <p className="text-xs text-gray-600 mb-3">{product.unit}</p>

        {/* Add to Cart Button / Quantity Selector */}
        {!showQuantitySelector ? (
          <button
            onClick={() => setShowQuantitySelector(true)}
            disabled={product.currentStock === 0 || isAdding}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-colors mt-auto"
            style={{
              backgroundColor:
                product.currentStock === 0 ? "#d1d5db" : "#1B2A5E",
            }}
          >
            {product.currentStock === 0 ? "Out of Stock" : "Add to Cart"}
          </button>
        ) : (
          <div className="flex gap-2 mt-auto">
            <div className="flex-1 flex items-center gap-1 border border-gray-300 rounded-lg">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-2 py-1 text-gray-600 hover:bg-gray-100"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={product.currentStock}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setQuantity(Math.min(val, product.currentStock));
                }}
                className="flex-1 text-center text-sm font-semibold border-0 focus:ring-0"
              />
              <button
                onClick={() =>
                  setQuantity(Math.min(quantity + 1, product.currentStock))
                }
                className="px-2 py-1 text-gray-600 hover:bg-gray-100"
              >
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={isAdding}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold text-sm rounded-lg transition-colors"
            >
              {isAdding ? "..." : "✓"}
            </button>
          </div>
        )}
      </div>

      {/* Click to View Detail */}
      <button
        onClick={() => router.push(`/customer/products/${product.id}`)}
        className="w-full py-2 text-xs text-gray-600 hover:text-blue-600 border-t border-gray-200 transition-colors"
      >
        View Details →
      </button>
    </div>
  );
}
