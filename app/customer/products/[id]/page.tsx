"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import useCart from "../../hooks/useCart";
import QuantitySelector from "../components/QuantitySelector";
import RelatedProducts from "../components/RelatedProducts";
import { formatPrice, formatQty } from "@/lib/formatters";

interface Product {
  id: string;
  name: string;
  productSubName?: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number;
  productImage?: string;
  description?: string;
  category?: string;
  storageType?: string;
  b2bPrice?: number;
  b2cPrice?: number;
  costPrice?: number;
  requiresWeighing?: boolean;
  minWeightPerUnit?: number;
  maxWeightPerUnit?: number;
  packSizeG?: number;
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

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const { addItem } = useCart();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Scroll to top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [productId]);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get customer ID from localStorage
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) {
          router.push("/customer/login");
          return;
        }

        const session = JSON.parse(sessionStr);
        const customerId = session.userId;
        const customerType = session.customerType || "B2C";

        // Fetch all products
        const getProductCatalog = httpsCallable(functions, "getProductCatalog");
        const result: any = await getProductCatalog({ customerId, customerType });

        if (result.data && Array.isArray(result.data)) {
          setAllProducts(result.data);

          // Find the specific product
          const found = result.data.find((p: Product) => p.id === productId);
          if (found) {
            setProduct(found);
          } else {
            setError("Product not found");
          }
        } else {
          setError("Failed to load product");
        }
      } catch (err: any) {
        console.error("Error fetching product:", err);
        setError(err.message || "Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [productId, router]);

  const handleAddToCart = async (quantity: number) => {
    if (!product) return;

    setIsAddingToCart(true);
    try {
      addItem({
        productId: product.id,
        productName: product.name,
        quantity,
        priceAtTime: product.price,
      });

      // Success feedback — brief toast then navigate back
      showToast("Added to cart ✓");
      setTimeout(() => router.push("/customer/products"), 1000);
    } catch (err) {
      console.error("Error adding to cart:", err);
      showToast("Failed to add to cart", "error");
    } finally {
      setIsAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-4">❌</p>
          <p className="text-gray-900 font-semibold mb-4">{error || "Product not found"}</p>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 text-white font-semibold rounded-lg cursor-pointer hover:opacity-90"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Back to Products
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2`}
          style={{ backgroundColor: toast.type === "error" ? "#B5535A" : "#1B2A5E", minWidth: 200 }}>
          {toast.type === "success"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          }
          {toast.msg}
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/customer/products")}
            className="text-gray-600 hover:text-gray-900 text-lg font-semibold cursor-pointer"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Product Image */}
          <div>
            <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
              {isValidUrl(product.productImage) ? (
                <Image
                  src={product.productImage!}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <span className="text-6xl">📦</span>
                </div>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Name & Subname */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{product.name}</h2>
              {product.productSubName && (
                <p className="text-gray-600 text-sm mt-1">{product.productSubName}</p>
              )}
              {product.requiresWeighing && product.minWeightPerUnit && product.maxWeightPerUnit && (
                <p className="text-2xl font-bold text-gray-700 mt-2">
                  ⚖️ {product.minWeightPerUnit}–{product.maxWeightPerUnit} g
                </p>
              )}
            </div>

            {/* Origin & Category */}
            <div className="flex gap-2 flex-wrap">
              {product.origin && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>
                  {product.origin}
                </span>
              )}
              {product.category && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>
                  {product.category}
                </span>
              )}
              {product.storageType && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>
                  {product.storageType}
                </span>
              )}
            </div>

            {/* Price */}
            <div className="border-t border-b border-gray-200 py-4">
              {product.requiresWeighing ? (
                <>
                  <p className="text-4xl font-bold text-gray-900">
                    ${formatPrice(product.price)} <span className="text-xl font-medium text-gray-500">/kg</span>
                  </p>
                  <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mt-1" style={{ color: "#B5535A", backgroundColor: "#FAF0F0" }}>Final price based on confirmed weight at delivery</span>
                </>
              ) : product.packSizeG ? (
                <p className="text-4xl font-bold text-gray-900">
                  ${formatPrice(product.price * product.packSizeG / 1000)}
                  <span className="text-xl font-medium text-gray-500"> / {product.packSizeG}g</span>
                </p>
              ) : (
                <p className="text-4xl font-bold text-gray-900">
                  ${formatPrice(product.price)}
                </p>
              )}
            </div>

            {/* Stock Status */}
            <div className={`text-sm font-semibold px-4 py-2 rounded-lg ${stockColor} w-fit`}>
              {stockStatus}
            </div>

            {/* Description */}
            {product.description && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-600 text-sm">{product.description}</p>
              </div>
            )}

            {/* Quantity Selector & Add to Cart */}
            <QuantitySelector
              price={product.price}
              maxQuantity={product.currentStock}
              onQuantityChange={() => {}}
              onAddToCart={handleAddToCart}
              isLoading={isAddingToCart}
            />

            {/* Continue Shopping Button */}
            <button
              onClick={() => router.push("/customer/products")}
              className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>

        {/* Related Products */}
        {allProducts.length > 0 && (
          <RelatedProducts currentProduct={product} allProducts={allProducts} />
        )}
      </div>
    </div>
  );
}
