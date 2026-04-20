"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

interface Category {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Load categories from Firestore
  useEffect(() => {
    const loadCategories = async () => {
      setLoading(true);
      setError(null);

      try {
        const categoriesRef = collection(db, "productCategories");
        const snapshot = await getDocs(categoriesRef);
        const loaded = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          } as Category))
          .sort((a, b) => a.name.localeCompare(b.name));

        setCategories(loaded);
      } catch (err: any) {
        console.error("Error loading categories:", err);
        setError(err.message || "Failed to load categories");
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setError("Category name is required");
      return;
    }

    // Check for duplicates
    if (categories.some((c) => c.name.toLowerCase() === newCategoryName.toLowerCase())) {
      setError("Category already exists");
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const categoryId = newCategoryName.toLowerCase().replace(/\s+/g, "-");
      const now = new Date().toISOString();

      await setDoc(doc(db, "productCategories", categoryId), {
        name: newCategoryName,
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      setCategories((prev) =>
        [...prev, { id: categoryId, name: newCategoryName, active: true, createdAt: now, updatedAt: now }]
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewCategoryName("");
    } catch (err: any) {
      setError(err.message || "Failed to add category");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (categoryId: string, currentActive: boolean) => {
    try {
      const now = new Date().toISOString();
      await setDoc(
        doc(db, "productCategories", categoryId),
        {
          active: !currentActive,
          updatedAt: now,
        },
        { merge: true }
      );

      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === categoryId ? { ...cat, active: !currentActive, updatedAt: now } : cat
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to update category");
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm("Are you sure? This will hide the category for customers.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "productCategories", categoryId));
      setCategories((prev) => prev.filter((cat) => cat.id !== categoryId));
    } catch (err: any) {
      setError(err.message || "Failed to delete category");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Category Management</h1>
        <p className="text-gray-600 mt-1">Manage product categories and visibility</p>
      </div>

      {/* Add Category Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Category</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
            placeholder="Enter category name (e.g., SALMON)"
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={handleAddCategory}
            disabled={isAdding || !newCategoryName.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            {isAdding ? "Adding..." : "Add Category"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 font-semibold">{error}</p>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Category Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-medium">{category.name}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          category.active
                            ? "bg-green-50 text-green-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {category.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(category.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleToggleActive(category.id, category.active)}
                        className={`px-3 py-1 text-sm font-semibold rounded-lg transition-colors ${
                          category.active
                            ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                            : "bg-green-50 text-green-600 hover:bg-green-100"
                        }`}
                      >
                        {category.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="px-3 py-1 text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 font-semibold mb-2">Category Summary</p>
          <p className="text-blue-800 text-sm">
            Total Categories: <span className="font-bold">{categories.length}</span> |
            Active: <span className="font-bold text-green-600">{categories.filter((c) => c.active).length}</span> |
            Inactive: <span className="font-bold text-red-600">{categories.filter((c) => !c.active).length}</span>
          </p>
          <p className="text-blue-800 text-sm mt-2">
            💡 Deactivate categories to hide them from the customer product filter without deleting them.
          </p>
        </div>
      )}
    </div>
  );
}
