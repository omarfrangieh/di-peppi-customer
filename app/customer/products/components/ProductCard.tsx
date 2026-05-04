"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useCart from "../../hooks/useCart";
import { formatPrice, formatQty, toTitleCase } from "@/lib/formatters";
import { showToast } from "@/lib/toast";

interface Product {
  id: string;
  name: string;
  productSubName?: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number;
  productImage?: string;
  productImages?: string[];
  description?: string;
  requiresWeighing?: boolean;
  minWeightPerUnit?: number;
  maxWeightPerUnit?: number;
  packSizeG?: number;
  netWeightG?: number;
  drainedWeightG?: number;
  caliber?: string;
}

interface ProductCardProps {
  product: Product;
  onAddToCart?: () => void;
}

// Helper function to validate URL
function isValidUrl(url?: string): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [imgError, setImgError] = useState(false);

  const stockStatus =
    product.currentStock === 0
      ? "Out of Stock"
      : product.currentStock < 5
      ? "Limited Stock"
      : "In Stock";

  const stockColor =
    product.currentStock === 0
      ? "text-[#B5535A] bg-[#FAF0F0]"
      : product.currentStock < 5
      ? "text-orange-600 bg-orange-50"
      : "text-green-600 bg-green-50";

  const handleAddToCart = async () => {
    if (quantity > product.currentStock) {
      showToast(`Only ${formatQty(product.currentStock)} available`, "warning");
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

      setQuantity(1);
      showToast("Added to cart ✓");
      onAddToCart?.();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="relative bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
      {/* Image — single primary image; carousel available on detail page */}
      {(() => {
        const src = product.productImage || (product.productImages?.[0]) || null;
        return (
          <div className="relative w-full h-48 bg-white flex-shrink-0 flex items-center justify-center overflow-hidden">
            {isValidUrl(src ?? undefined) && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src!}
                alt={product.name}
                className="w-full h-full object-contain py-2 px-2"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <span className="text-5xl">📦</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        {/* Product Name */}
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-0.5">
          {toTitleCase(product.name)}
        </h3>

        {/* Info block — natural height, mt-auto on bottom section handles alignment */}
        <div className="mb-2">
          {product.productSubName && product.productSubName !== "0" && (
            <p className="text-xs text-gray-400 mb-0.5">{toTitleCase(product.productSubName)}</p>
          )}
          {(product.packSizeG || product.netWeightG || product.drainedWeightG) && (
            <p className="text-xs font-bold text-gray-700 mb-0.5">
              {[
                product.packSizeG ? `${product.packSizeG}g` : null,
                product.netWeightG && !product.packSizeG ? `${product.netWeightG}g net` : null,
                product.drainedWeightG ? `${product.drainedWeightG}g drained` : null,
              ].filter(Boolean).join(" · ")}
            </p>
          )}
          {!!(product.requiresWeighing && product.minWeightPerUnit && product.maxWeightPerUnit) && (
            <p className="text-xs font-bold text-gray-700 mb-0.5">
              {product.minWeightPerUnit}–{product.maxWeightPerUnit} g
            </p>
          )}
          {product.origin && (
            <p className="text-xs text-gray-500">from {toTitleCase(product.origin)}</p>
          )}
        </div>

        {/* Bottom section — mt-auto always pins this entire block to the card bottom */}
        <div className="mt-auto">
          {/* Price block: responsive min-h so same-type cards align on any screen width */}
          <div className="min-h-[100px] sm:min-h-[76px] lg:min-h-[54px] mb-2">
            {product.requiresWeighing ? (
              <>
                <p className="text-lg font-bold text-gray-900">
                  ${formatPrice(product.price)} <span className="text-sm font-medium text-gray-500">/kg</span>
                </p>
                <p className="text-xs font-semibold px-2.5 py-1 rounded-xl mt-1 block" style={{ color: "#B5535A", backgroundColor: "#FAF0F0" }}>Final price based on confirmed weight</p>
              </>
            ) : product.packSizeG ? (
              <p className="text-lg font-bold text-gray-900">
                ${formatPrice(product.price * product.packSizeG / 1000)}
                <span className="text-sm font-medium text-gray-500"> / {product.packSizeG}g</span>
              </p>
            ) : (
              <p className="text-lg font-bold text-gray-900">
                ${formatPrice(product.price)}
                {product.unit && <span className="text-sm font-medium text-gray-500"> /{product.unit.toLowerCase()}</span>}
              </p>
            )}
          </div>

          {/* Stock Status */}
          <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${stockColor} mb-3 w-fit`}>
            {product.currentStock > 0 && product.currentStock < 5
              ? `Only ${formatQty(product.currentStock)}${product.requiresWeighing ? " kg" : product.unit ? ` ${toTitleCase(product.unit)}` : ""} left`
              : stockStatus}
          </div>

          {/* Quantity stepper + add to cart */}
          <div className="flex flex-col gap-2">
          <div className={`flex items-center justify-between border rounded-lg ${product.currentStock === 0 ? "border-gray-200 opacity-50" : "border-gray-300"}`}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={product.currentStock === 0 || quantity <= 1}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed disabled:text-gray-300"
            >
              −
            </button>
            <div className="flex items-center gap-1 flex-1 justify-center">
              <input
                type="number"
                min={1}
                max={product.currentStock}
                value={quantity}
                disabled={product.currentStock === 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setQuantity(Math.min(val, product.currentStock));
                }}
                className="w-7 text-center text-sm font-semibold border-0 focus:ring-0 disabled:bg-transparent"
              />
              {product.packSizeG
                ? <span className="text-sm font-semibold text-gray-700">× {product.packSizeG}g</span>
                : product.unit && <span className="text-sm font-semibold text-gray-700">{toTitleCase(product.unit)}</span>
              }
            </div>
            <button
              onClick={() => setQuantity(Math.min(quantity + 1, product.currentStock))}
              disabled={product.currentStock === 0 || quantity >= product.currentStock}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed disabled:text-gray-300"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={product.currentStock === 0 || isAdding}
            className="w-full py-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            style={{ backgroundColor: product.currentStock === 0 ? "#d1d5db" : "#1B2A5E" }}
          >
            {isAdding ? "Adding..." : product.currentStock === 0 ? "Out of Stock" : "Add to Cart"}
          </button>
        </div>
        </div>{/* end mt-auto bottom section */}
      </div>

      {/* Click to View Detail */}
      <button
        onClick={() => router.push(`/customer/products/${product.id}`)}
        className="w-full py-2 text-xs text-gray-600 hover:text-blue-600 border-t border-gray-200 transition-colors cursor-pointer"
      >
        View Details →
      </button>
    </div>
  );
}
