"use client";

import { useMemo } from "react";
import ProductCard from "./ProductCard";

interface Product {
  id: string;
  name: string;
  origin?: string;
  unit: string;
  currentStock: number;
  price: number;
  productImage?: string;
  description?: string;
  category?: string;
  storageType?: string;
}

interface RelatedProductsProps {
  currentProduct: Product;
  allProducts: Product[];
}

export default function RelatedProducts({
  currentProduct,
  allProducts,
}: RelatedProductsProps) {
  const relatedProducts = useMemo(() => {
    return allProducts
      .filter(
        (p) =>
          p.id !== currentProduct.id &&
          p.category === currentProduct.category
      )
      .slice(0, 4); // Show max 4 related products
  }, [allProducts, currentProduct]);

  if (relatedProducts.length === 0) {
    return null;
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Related Products
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {relatedProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
