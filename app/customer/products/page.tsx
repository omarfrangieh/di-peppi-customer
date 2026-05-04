"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

function resolveImageUrl(raw?: string): string {
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  // Storage path like /products/foo.png → GCS public bucket URL
  const clean = raw.startsWith("/") ? raw.slice(1) : raw;
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `https://di-peppi-images.storage.googleapis.com/${encoded}`;
}
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
  productImages?: string[];
  description?: string;
  category?: string;
  storageType?: string;
  requiresWeighing?: boolean;
  minWeightPerUnit?: number;
  maxWeightPerUnit?: number;
  packSizeG?: number;
  netWeightG?: number;
  drainedWeightG?: number;
  caliber?: string;
  b2cOnly?: boolean;
}

export default function ProductsPage() {
  const router = useRouter();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFilterChange = useCallback(
    (filtered: any[]) => setFilteredProducts(filtered as Product[]),
    []
  );

  useEffect(() => {
    const sessionStr = localStorage.getItem("session");
    if (!sessionStr) { router.push("/customer/login"); return; }
    const session = JSON.parse(sessionStr);
    const customerType = session.customerType || "B2C";

    const q = query(collection(db, "products"), where("active", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Product[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || "",
              productSubName: data.productSubName || "",
              origin: data.origin || "",
              unit: data.unit || "",
              currentStock: data.currentStock ?? 0,
              price: data.b2cPrice ?? data.price ?? 0,
              productImage: resolveImageUrl(data.productImage),
              productImages: Array.isArray(data.productImages) ? data.productImages : undefined,
              description: data.description || "",
              category: data.category || "",
              storageType: data.storageType || "",
              requiresWeighing: Boolean(data.requiresWeighing),
              minWeightPerUnit: Number(data.minWeightPerUnit || 0),
              maxWeightPerUnit: Number(data.maxWeightPerUnit || 0),
              packSizeG: data.packSizeG ? Number(data.packSizeG) : undefined,
              netWeightG: data.netWeightG ? Number(data.netWeightG) : undefined,
              drainedWeightG: data.drainedWeightG ? Number(data.drainedWeightG) : undefined,
              caliber: data.caliber || undefined,
              b2cOnly: Boolean(data.b2cOnly),
              b2bOnly: Boolean(data.b2bOnly),
            };
          })
          // B2C shop never shows b2bOnly products
          .filter((p) => p.name && p.price > 0 && !p.b2bOnly && (customerType === "B2C" || !p.b2cOnly))
          .sort((a, b) => {
            // In stock first, then alphabetical
            const aInStock = a.currentStock > 0 ? 0 : 1;
            const bInStock = b.currentStock > 0 ? 0 : 1;
            if (aInStock !== bInStock) return aInStock - bInStock;
            return a.name.localeCompare(b.name);
          });
        setAllProducts(list);
        setFilteredProducts(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching products:", err);
        setError(err.message || "Failed to load products");
        setLoading(false);
      }
    );

    return unsub;
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page title — no duplication with header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ color: "#B5535A", fontFamily: "var(--font-playfair)" }}>Our Products</h1>
            <p className="text-xs text-gray-400 mt-0.5">Premium quality, delivered to your door</p>
          </div>
          {!loading && (
            <span className="text-xs text-gray-400 font-medium">{allProducts.length} items</span>
          )}
        </div>
      </div>

      {/* Sticky search + category filter */}
      {!loading && allProducts.length > 0 && (
        <SearchFilter
          products={allProducts}
          onFilterChange={handleFilterChange}
        />
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        )}

        <ProductGrid products={filteredProducts} isLoading={loading} />
      </div>
    </div>
  );
}
