"use client";

import ProductCard from "./ProductCard";

interface Product {
  id: string;
  name: string;
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
}

interface ProductGridProps {
  products: Product[];
  isLoading?: boolean;
}

export default function ProductGrid({ products, isLoading }: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-gray-600 font-semibold mb-1">No products found</p>
        <p className="text-gray-500 text-sm">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
