"use client";

import { useEffect, useState, useRef } from "react";
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
import { AlertTriangle, Check, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  productCount?: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSavingRename, setIsSavingRename] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, "productCategories")),
        getDocs(collection(db, "products")),
      ]);

      // Build count map by category name
      const countByName: Record<string, number> = {};
      prodSnap.docs.forEach((d) => {
        const cat = d.data().category;
        if (cat && typeof cat === "string") {
          countByName[cat] = (countByName[cat] ?? 0) + 1;
        }
      });

      const loaded = catSnap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          productCount: countByName[d.data().name] ?? 0,
        } as Category));

      setCategories(sortCategories(loaded));
    } catch (err: any) {
      setError(err.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const sortCategories = (cats: Category[]) =>
    [...cats].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

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
        sortCategories([...prev, { id: categoryId, name, active: true, createdAt: now, updatedAt: now, productCount: 0 }])
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
        sortCategories(prev.map((cat) => cat.id === categoryId ? { ...cat, active: !currentActive, updatedAt: now } : cat))
      );
    } catch (err: any) {
      setError(err.message || "Failed to update category");
    }
  };

  const handleDeleteClick = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    setDeleteTarget(category);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "productCategories", deleteTarget.id));
      const prodSnap = await getDocs(query(collection(db, "products"), where("category", "==", deleteTarget.name)));
      prodSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      setCategories((prev) => prev.filter((cat) => cat.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartRename = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleConfirmRename = async (categoryId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) { handleCancelRename(); return; }
    const original = categories.find((c) => c.id === categoryId);
    if (!original || trimmed === original.name) { handleCancelRename(); return; }
    setIsSavingRename(true);
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, "productCategories", categoryId), { name: trimmed, updatedAt: now }, { merge: true });
      setCategories((prev) =>
        sortCategories(prev.map((c) => c.id === categoryId ? { ...c, name: trimmed, updatedAt: now } : c))
      );
      setEditingId(null);
      setEditingName("");
    } catch (err: any) {
      setError(err.message || "Failed to rename category");
    } finally {
      setIsSavingRename(false);
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

  const productCount = deleteTarget?.productCount ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Categories</h1>
          <span className="text-xs text-gray-400 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
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
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No categories yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Category</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => { setNewCategoryName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder="e.g. SALMON"
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500"
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent dark:border-white rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
              {search ? "No categories match your search." : "No categories yet. Add one above."}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Products
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {editingId === cat.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleConfirmRename(cat.id);
                              if (e.key === "Escape") handleCancelRename();
                            }}
                            placeholder={cat.name}
                            disabled={isSavingRename}
                            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 w-40 capitalize"
                            style={{ textTransform: "capitalize" }}
                          />
                          <button
                            onClick={() => handleConfirmRename(cat.id)}
                            disabled={isSavingRename}
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 disabled:opacity-40"
                            title="Confirm"
                          >
                            <Check size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={handleCancelRename}
                            disabled={isSavingRename}
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
                            title="Cancel"
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <span
                          onClick={() => handleStartRename(cat)}
                          className="cursor-pointer hover:underline hover:underline-offset-2"
                          style={{ textTransform: "capitalize" }}
                          title="Click to rename"
                        >
                          {cat.name.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        cat.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.active ? "bg-green-500" : "bg-gray-400"}`} />
                        {cat.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {(cat.productCount ?? 0) === 0
                        ? <span className="text-gray-400 dark:text-gray-500">—</span>
                        : <span className="text-gray-700 dark:text-gray-300">{cat.productCount}</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400 dark:text-gray-500">
                      {cat.createdAt ? new Date(cat.createdAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(cat.id, cat.active)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            cat.active
                              ? "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                              : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {cat.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDeleteClick(cat.id)}
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
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Deactivating a category hides it from the customer product filter without deleting it.
          </p>
        )}

      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center mb-4">
              <AlertTriangle className="text-red-500 dark:text-red-400 mb-3" size={32} strokeWidth={2} />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {productCount > 0 ? "Category In Use" : "Delete Category?"}
              </h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
              {productCount > 0
                ? <><span className="font-semibold text-gray-700 dark:text-gray-200">"{deleteTarget.name.toLowerCase()}"</span> is used by {productCount} product{productCount !== 1 ? "s" : ""}. Deleting it will remove this category from those products.</>
                : <><span className="font-semibold text-gray-700 dark:text-gray-200">"{deleteTarget.name.toLowerCase()}"</span> is not used by any products and will be permanently removed.</>
              }
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Keep
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting..." : productCount > 0 ? "Delete Anyway" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
