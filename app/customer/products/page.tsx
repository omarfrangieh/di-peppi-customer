"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import ProductGrid from "./components/ProductGrid";
import SearchFilter from "./components/SearchFilter";

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
}

export default function ProductsPage() {
  const router = useRouter();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get customer ID from localStorage session
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) {
          router.push("/customer/login");
          return;
        }

        const session = JSON.parse(sessionStr);
        const customerId = session.userId;
        const customerType = session.customerType || "B2C";

        // Call getProductCatalog Cloud Function
        const getProductCatalog = httpsCallable(functions, "getProductCatalog");
        const result: any = await getProductCatalog({ customerId, customerType });

        const list = Array.isArray(result.data)
          ? result.data
          : Array.isArray((result.data as any)?.products)
            ? (result.data as any).products
            : null;

        if (list) {
          setAllProducts(list);
          setFilteredProducts(list);
        } else {
          setError("Failed to load products");
        }
      } catch (err: any) {
        console.error("Error fetching products:", err);
        setError(err.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Browse Products</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              {filteredProducts.length > 0
                ? `${filteredProducts.length} product${filteredProducts.length !== 1 ? "s" : ""} available`
                : "No products found"}
            </p>
          </div>
          <button
            onClick={() => router.push("/customer/cart")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            🛒 View Cart
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        )}

        {/* Search & Filter */}
        {!loading && allProducts.length > 0 && (
          <SearchFilter products={allProducts} onFilterChange={(filtered) => setFilteredProducts(filtered as Product[])} />
        )}

        {/* Product Grid */}
        <ProductGrid products={filteredProducts} isLoading={loading} />
      </div>
    </div>
  );
}
