"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import SearchInput from "@/components/SearchInput";

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
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    void loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, "productCategories"));
      const loaded = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Category))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCategories(loaded);
    } catch (err: any) {
      setError(err.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) { setError("Category name is required"); return; }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setError("Category already exists");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const categoryId = name.toLowerCase().replace(/\s+/g, "-");
      const now = new Date().toISOString();
      await setDoc(doc(db, "productCategories", categoryId), {
        name,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      setCategories((prev) =>
        [...prev, { id: categoryId, name, active: true, createdAt: now, updatedAt: now }]
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
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    if (currentActive && !window.confirm(
      `Deactivating "${category.name}" will also deactivate all products in this category. Continue?`
    )) return;
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, "productCategories", categoryId), { active: !currentActive, updatedAt: now }, { merge: true });
      if (currentActive) {
        const prodSnap = await getDocs(query(collection(db, "products"), where("category", "==", category.name)));
        prodSnap.docs.forEach((d) => batch.update(d.ref, { active: false, updatedAt: now }));
      }
      await batch.commit();
      setCategories((prev) =>
        prev.map((cat) => cat.id === categoryId ? { ...cat, active: !currentActive, updatedAt: now } : cat)
      );
    } catch (err: any) {
      setError(err.message || "Failed to update category");
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    if (!window.confirm(
      `Delete "${category.name}"? This will also delete all products in this category. This cannot be undone.`
    )) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "productCategories", categoryId));
      const prodSnap = await getDocs(query(collection(db, "products"), where("category", "==", category.name)));
      prodSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      setCategories((prev) => prev.filter((cat) => cat.id !== categoryId));
    } catch (err: any) {
      setError(err.message || "Failed to delete category");
    }
  };

  const handleInitializeCategories = async () => {
    if (!window.confirm(
      "This will extract all categories from your products and mark them as active. Continue?"
    )) return;
    setIsInitializing(true);
    setError(null);
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const unique = new Set<string>();
      prodSnap.docs.forEach((d) => {
        const cat = d.data().category;
        if (cat && typeof cat === "string") unique.add(cat);
      });
      const now = new Date().toISOString();
      for (const name of Array.from(unique).sort()) {
        const id = name.toLowerCase().replace(/\s+/g, "-");
        await setDoc(doc(db, "productCategories", id), { name, active: true, createdAt: now, updatedAt: now }, { merge: true });
      }
      await loadCategories();
    } catch (err: any) {
      setError(err.message || "Failed to initialize categories");
    } finally {
      setIsInitializing(false);
    }
  };

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = categories.filter((c) => c.active).length;
  const inactiveCount = categories.length - activeCount;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Categories</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {categories.length}
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
          {inactiveCount > 0 && (
            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
              {inactiveCount} inactive
            </span>
          )}
        </div>
        <SearchInput
          placeholder="Search categories..."
          value={search}
          onChange={setSearch}
          className="w-56"
        />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Initialize prompt — only shown when empty */}
        {categories.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-1">No categories yet</p>
            <p className="text-sm text-gray-500 mb-4">
              Import existing categories from your products to get started quickly.
            </p>
            <button
              onClick={handleInitializeCategories}
              disabled={isInitializing}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              {isInitializing ? "Importing..." : "Import from Products"}
            </button>
          </div>
        )}

        {/* Add category */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Add Category</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => { setNewCategoryName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder="e.g. SALMON"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={handleAddCategory}
              disabled={isAdding || !newCategoryName.trim()}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 transition-colors"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              {isAdding ? "Adding..." : "Add"}
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
        </div>

        {/* Categories table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              {search ? "No categories match your search." : "No categories yet. Add one above."}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{cat.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        cat.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.active ? "bg-green-500" : "bg-gray-400"}`} />
                        {cat.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {cat.createdAt ? new Date(cat.createdAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(cat.id, cat.active)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            cat.active
                              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {cat.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tip */}
        {!loading && categories.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            Deactivating a category hides it from the customer product filter without deleting it.
          </p>
        )}

      </div>
    </div>
  );
}
