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

      // Success feedback
      alert(`${product.name} added to cart!`);
      router.push("/customer/products");
    } catch (err) {
      console.error("Error adding to cart:", err);
      alert("Failed to add to cart");
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
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
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/customer/products")}
            className="text-gray-600 hover:text-gray-900 text-lg font-semibold"
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
            </div>

            {/* Origin & Category */}
            <div className="flex gap-4 flex-wrap">
              {product.origin && (
                <div className="bg-blue-50 px-3 py-1 rounded-lg">
                  <p className="text-xs text-blue-600 font-semibold">Origin: {product.origin}</p>
                </div>
              )}
              {product.category && (
                <div className="bg-purple-50 px-3 py-1 rounded-lg">
                  <p className="text-xs text-purple-600 font-semibold">Category: {product.category}</p>
                </div>
              )}
              {product.storageType && (
                <div className="bg-amber-50 px-3 py-1 rounded-lg">
                  <p className="text-xs text-amber-600 font-semibold">Storage: {product.storageType}</p>
                </div>
              )}
            </div>

            {/* Price */}
            <div className="border-t border-b border-gray-200 py-4">
              <p className="text-4xl font-bold text-gray-900">
                ${formatPrice(product.price)}
              </p>
              <p className="text-gray-600 text-sm mt-1">Unit: {product.unit}</p>
            </div>

            {/* Stock Status */}
            <div className={`text-sm font-semibold px-4 py-2 rounded-lg ${stockColor} w-fit`}>
              {stockStatus} ({formatQty(product.currentStock)} available)
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
              className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
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
