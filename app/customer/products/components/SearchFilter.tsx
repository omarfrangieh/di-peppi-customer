"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toTitleCase } from "@/lib/formatters";

interface Product {
  id: string;
  name: string;
  category?: string;
  [key: string]: any;
}

interface SearchFilterProps {
  products: Product[];
  onFilterChange: (filtered: Product[]) => void;
}

export default function SearchFilter({ products, onFilterChange }: SearchFilterProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () => ["All", ...([...new Set(products.map((p) => p.category).filter(Boolean))] as string[]).sort()],
    [products]
  );

  const filterProducts = useCallback(() => {
    const filtered = products.filter((product) => {
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        if (
          !product.name?.toLowerCase().includes(q) &&
          !product.productSubName?.toLowerCase().includes(q)
        ) return false;
      }
      if (selectedCategory && selectedCategory !== "All" && product.category !== selectedCategory) {
        return false;
      }
      return true;
    });
    onFilterChange(filtered);
  }, [products, searchText, selectedCategory, onFilterChange]);

  useEffect(() => { filterProducts(); }, [filterProducts]);

  const hasActiveFilter = searchText.trim() || (selectedCategory && selectedCategory !== "All");

  const handleReset = () => {
    setSearchText("");
    setSelectedCategory("");
  };

  return (
    <div className="sticky top-14 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto">

        {/* Row 1 — Search bar */}
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              placeholder="Search products..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-100 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-400"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none"
                aria-label="Clear"
              >×</button>
            )}
          </div>

          {hasActiveFilter && (
            <button
              onClick={handleReset}
              className="flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>

        {/* Row 2 — Category pills (horizontal scroll, no scrollbar) */}
        {categories.length > 1 && (
          <div
            className="flex gap-2 overflow-x-auto px-3 pb-2.5 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {categories.map((cat) => {
              const active = cat === "All" ? !selectedCategory || selectedCategory === "All" : selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === "All" ? "" : cat)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? "text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300"
                  }`}
                  style={active ? { backgroundColor: "#1B2A5E" } : {}}
                >
                  {cat === "All" ? "All" : toTitleCase(cat)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
