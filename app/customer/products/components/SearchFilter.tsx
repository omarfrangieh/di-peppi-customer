"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Product {
  id: string;
  name: string;
  origin?: string;
  category?: string;
  storageType?: string;
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
  const [selectedStorageType, setSelectedStorageType] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState("");

  // Extract unique values for dropdowns
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );

  const storageTypes = useMemo(
    () => [...new Set(products.map((p) => p.storageType).filter(Boolean))],
    [products]
  );

  const origins = useMemo(
    () => [...new Set(products.map((p) => p.origin).filter(Boolean))],
    [products]
  );

  // Debounced filter function
  const filterProducts = useCallback(() => {
    const filtered = products.filter((product) => {
      // Text search (name or subname)
      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        const matchesSearch =
          product.name?.toLowerCase().includes(searchLower) ||
          product.productSubName?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory && product.category !== selectedCategory) {
        return false;
      }

      // Storage type filter
      if (selectedStorageType && product.storageType !== selectedStorageType) {
        return false;
      }

      // Origin filter
      if (selectedOrigin && product.origin !== selectedOrigin) {
        return false;
      }

      return true;
    });

    onFilterChange(filtered);
  }, [products, searchText, selectedCategory, selectedStorageType, selectedOrigin, onFilterChange]);

  // Call filter whenever any filter changes (using useEffect to avoid render-time state updates)
  useEffect(() => {
    filterProducts();
  }, [filterProducts]);

  const handleReset = () => {
    setSearchText("");
    setSelectedCategory("");
    setSelectedStorageType("");
    setSelectedOrigin("");
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search Input */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
            Search
          </label>
          <input
            type="text"
            placeholder="Product name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Storage Type Filter */}
        {storageTypes.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
              Storage Type
            </label>
            <select
              value={selectedStorageType}
              onChange={(e) => setSelectedStorageType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Types</option>
              {storageTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Origin Filter */}
        {origins.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
              Origin
            </label>
            <select
              value={selectedOrigin}
              onChange={(e) => setSelectedOrigin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Origins</option>
              {origins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Reset Button */}
        <div className="flex items-end">
          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold text-sm rounded-lg transition-colors"
          >
            Reset Filters
          </button>
        </div>
      </div>
    </div>
  );
}
