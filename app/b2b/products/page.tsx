"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

function resolveImageUrl(raw?: string): string {
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const clean = raw.startsWith("/") ? raw.slice(1) : raw;
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `https://di-peppi-images.storage.googleapis.com/${encoded}`;
}
import B2BProductCard from "./components/B2BProductCard";
import useB2BCart from "../hooks/useCart";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface Product {
  id: string;
  name: string;
  productSubName?: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number;
  retailPrice?: number;
  productImage?: string;
  description?: string;
  category?: string;
  caseSize?: number;
  minOrderQty?: number;
  storageType?: string;
  packSizeG?: number;
  netWeightG?: number;
  drainedWeightG?: number;
  caliber?: string;
}

export default function B2BProductsPage() {
  const router = useRouter();
  const { items } = useB2BCart();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showInStockOnly, setShowInStockOnly] = useState(false);

  useEffect(() => {
    const sessionStr = localStorage.getItem("b2b-session");
    if (!sessionStr) { router.push("/b2b/login"); return; }

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
              price: data.b2bPrice ?? data.price ?? 0,
              retailPrice: data.b2cPrice ?? undefined,
              productImage: resolveImageUrl(data.productImage),
              description: data.description || "",
              category: data.category || "",
              caseSize: data.caseSize ?? undefined,
              minOrderQty: data.minOrderQty ?? undefined,
              storageType: data.storageType || "",
              packSizeG: data.packSizeG ? Number(data.packSizeG) : undefined,
              netWeightG: data.netWeightG ? Number(data.netWeightG) : undefined,
              drainedWeightG: data.drainedWeightG ? Number(data.drainedWeightG) : undefined,
              caliber: data.caliber || undefined,
            };
          })
          .filter((p) => p.name && p.price > 0);
        setAllProducts(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load products");
        setLoading(false);
      }
    );

    return unsub;
  }, [router]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(allProducts.map((p) => p.category).filter(Boolean)));
    return ["All", ...cats.sort()];
  }, [allProducts]);

  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === "All" || p.category === selectedCategory;
      const matchStock = !showInStockOnly || p.currentStock > 0;
      return matchSearch && matchCat && matchStock;
    });
  }, [allProducts, search, selectedCategory, showInStockOnly]);

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-[65px] z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-4 justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Product Catalogue</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading ? "Loading..." : `${filtered.length} product${filtered.length !== 1 ? "s" : ""} · Wholesale pricing`}
            </p>
          </div>
          <button
            onClick={() => router.push("/b2b/cart")}
            className="relative flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-colors hover:opacity-90 shrink-0"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            🛒 Cart
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
          />
          <div className="w-40">
            <SearchableSelect value={selectedCategory === "All" ? "" : selectedCategory} onChange={v => setSelectedCategory(v || "All")} options={categories.filter(c => c !== "All")} placeholder="All Categories" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInStockOnly}
              onChange={(e) => setShowInStockOnly(e.target.checked)}
              className="rounded"
            />
            In stock only
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 font-semibold text-sm">{error}</p>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl h-80 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((product) => (
              <B2BProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-gray-700 font-semibold mb-2">No products found</p>
            <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
            <button
              onClick={() => { setSearch(""); setSelectedCategory("All"); setShowInStockOnly(false); }}
              className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
