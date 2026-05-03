"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

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

export default function SearchFilter({
  products,
  onFilterChange,
}: SearchFilterProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const filterProducts = useCallback(() => {
    const filtered = products.filter((product) => {
      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        const matchesSearch =
          product.name?.toLowerCase().includes(searchLower) ||
          product.productSubName?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      if (selectedCategory && product.category !== selectedCategory) {
        return false;
      }
      return true;
    });
    onFilterChange(filtered);
  }, [products, searchText, selectedCategory, onFilterChange]);

  useEffect(() => {
    filterProducts();
  }, [filterProducts]);

  const handleReset = () => {
    setSearchText("");
    setSelectedCategory("");
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search Input */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
            Search
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Product name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none cursor-pointer"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
              Category
            </label>
            <SearchableSelect value={selectedCategory} onChange={setSelectedCategory} options={categories} placeholder="All Categories" />
          </div>
        )}

        {/* Reset Button */}
        <div className="flex items-end">
          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      </div>
    </div>
  );
}
