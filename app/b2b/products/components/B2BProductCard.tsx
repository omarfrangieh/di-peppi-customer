"use client";

import { useState } from "react";
import { showToast } from "@/lib/toast";
import useB2BCart from "../../hooks/useCart";
import { formatPrice } from "@/lib/formatters";

interface Product {
  id: string;
  name: string;
  productSubName?: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number; // B2B/wholesale price
  retailPrice?: number; // B2C price for comparison
  productImage?: string;
  description?: string;
  category?: string;
  caseSize?: number; // units per case
  minOrderQty?: number;
  packSizeG?: number;
  netWeightG?: number;
  drainedWeightG?: number;
  caliber?: string;
}

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}

export default function B2BProductCard({ product }: { product: Product }) {
  const { addItem } = useB2BCart();
  const [quantity, setQuantity] = useState(product.minOrderQty || 1);
  const [showSelector, setShowSelector] = useState(false);
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const minQty = product.minOrderQty || 1;
  const caseSize = product.caseSize || 1;
  const isOutOfStock = product.currentStock === 0;

  const stockLabel = isOutOfStock
    ? "Out of Stock"
    : product.currentStock < 10
    ? `Low Stock (${product.currentStock})`
    : "In Stock";

  const stockColor = isOutOfStock
    ? "text-red-600 bg-red-50 border-red-200"
    : product.currentStock < 10
    ? "text-orange-600 bg-orange-50 border-orange-200"
    : "text-green-700 bg-green-50 border-green-200";

  const handleAdd = () => {
    if (quantity > product.currentStock) {
      showToast(`Only ${product.currentStock} units available`, "warning");
      return;
    }
    addItem({
      productId: product.id,
      productName: product.name,
      quantity,
      priceAtTime: product.price,
      unit: product.unit,
      caseSize,
    });
    setShowSelector(false);
    setQuantity(minQty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-gray-300 transition-all h-full flex flex-col">
      {/* Image */}
      <div className="relative w-full h-40 bg-white shrink-0 flex items-center justify-center overflow-hidden">
        {isValidUrl(product.productImage) && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.productImage!} alt={product.name} className="w-full h-full object-contain p-2" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl bg-gray-50">📦</div>
        )}
        {/* Category badge */}
        {product.category && (
          <span className="absolute top-2 left-2 text-xs bg-white/90 text-gray-600 px-2 py-0.5 rounded-lg border border-gray-200 font-medium">
            {product.category}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-0.5">{product.name}</h3>
        {product.productSubName && product.productSubName !== "0" ? (
          <p className="text-xs text-gray-400 mb-1">{product.productSubName}</p>
        ) : (product.packSizeG || product.netWeightG || product.drainedWeightG || product.caliber) ? (
          <p className="text-xs text-gray-500 font-medium mb-1">
            {[
              product.packSizeG ? `${product.packSizeG}g` : null,
              product.netWeightG && !product.packSizeG ? `${product.netWeightG}g net` : null,
              product.drainedWeightG ? `${product.drainedWeightG}g drained` : null,
              product.caliber ? `cal. ${product.caliber}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {product.origin && <p className="text-xs text-gray-500 mb-2">🌍 {product.origin}</p>}

        {/* Pricing */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(product.price)}</span>
            <span className="text-xs text-gray-400">/ {product.unit}</span>
          </div>
          {product.retailPrice && product.retailPrice > product.price && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-gray-400 line-through">${formatPrice(product.retailPrice)}</span>
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                -{Math.round((1 - product.price / product.retailPrice) * 100)}% wholesale
              </span>
            </div>
          )}
          {caseSize > 1 && (
            <p className="text-xs text-gray-500 mt-1">📦 {caseSize} units/case · ${formatPrice(product.price * caseSize)}/case</p>
          )}
        </div>

        {/* Stock + min order */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${stockColor}`}>{stockLabel}</span>
          {minQty > 1 && (
            <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
              Min: {minQty}
            </span>
          )}
        </div>

        {/* Add to Cart */}
        <div className="mt-auto">
          {added ? (
            <div className="w-full py-2 bg-green-50 border border-green-200 text-green-700 font-semibold text-sm rounded-xl text-center">
              ✓ Added to cart
            </div>
          ) : !showSelector ? (
            <button
              onClick={() => setShowSelector(true)}
              disabled={isOutOfStock}
              className="w-full py-2 text-white font-semibold text-sm rounded-xl transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: isOutOfStock ? undefined : "#1B2A5E" }}
            >
              {isOutOfStock ? "Out of Stock" : "+ Add to Order"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(minQty, quantity - (caseSize > 1 ? caseSize : 1)))}
                    className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors font-bold"
                  >−</button>
                  <div className="flex items-center gap-1 flex-1 justify-center">
                    <input
                      type="number"
                      min={minQty}
                      value={quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || minQty;
                        setQuantity(Math.min(v, product.currentStock));
                      }}
                      className="w-8 text-center text-sm font-semibold border-0 focus:ring-0 py-2"
                    />
                    {product.packSizeG
                      ? <span className="text-sm font-semibold text-gray-700">× {product.packSizeG}g</span>
                      : product.unit && <span className="text-sm font-semibold text-gray-700">{product.unit}</span>
                    }
                  </div>
                  <button
                    onClick={() => setQuantity(Math.min(quantity + (caseSize > 1 ? caseSize : 1), product.currentStock))}
                    className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors font-bold"
                  >+</button>
                </div>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 text-white font-bold text-sm rounded-xl hover:opacity-90 transition-colors"
                  style={{ backgroundColor: "#1B2A5E" }}
                >✓</button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Total: ${formatPrice(product.price * quantity)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
