"use client";
import React from "react";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { formatQty, formatPrice } from "@/lib/formatters";
import Image from "next/image";

const DEFAULT_OPTIONS = {
  unit: ["KG", "Piece", "Tin", "Jar", "Tube"],
  storageType: ["Ambient", "Refrigerated", "Frozen", "Chilled", "Fresh"],
  category: [],
  origin: [],
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [search, setSearch] = useState("");
  const [newOption, setNewOption] = useState<Record<string, string>>({});
  const [showOptionsFor, setShowOptionsFor] = useState<string | null>(null);
  const [stockInProduct, setStockInProduct] = useState<any | null>(null);
  const [historyProduct, setHistoryProduct] = useState<any | null>(null);
  const [historyMovements, setHistoryMovements] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stockInQty, setStockInQty] = useState("");
  const [stockInNotes, setStockInNotes] = useState("");
  const [stockInSaving, setStockInSaving] = useState(false);
  const [stockInExpiry, setStockInExpiry] = useState("");
  const [productBatches, setProductBatches] = useState<Record<string, any[]>>({});
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<any>({
    name: "", productSubName: "", supplierId: "", supplier: "",
    category: "", origin: "", unit: "KG", storageType: "",
    costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "",
    active: true, requiresWeighing: false, trackExpiry: false,
    minWeightPerUnit: "", maxWeightPerUnit: "",
  });
  const [addingSaving, setAddingSaving] = useState(false);
  const [showMarginsFor, setShowMarginsFor] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (productId: string, file: File) => {
    if (!file) return;
    setUploadingImage(productId);
    try {
      const storageRef = ref(storage, `products/${productId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "products", productId), { productImage: url });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, productImage: url } : p));
      if (editing === productId) {
        setEditData((p: any) => ({ ...p, productImage: url }));
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      alert("Failed to upload image");
    } finally {
      setUploadingImage(null);
    }
  };

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, optSnap, suppSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDoc(doc(db, "settings", "productOptions")),
        getDocs(collection(db, "suppliers")),
      ]);
      setSuppliers(suppSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a:any, b:any) => (a.name||'').localeCompare(b.name||'')));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(data);
      if (optSnap.exists()) {
        setOptions({ ...DEFAULT_OPTIONS, ...optSnap.data() });
      }
      // Load expiring batches per product
      const movSnap = await getDocs(collection(db, "stockMovements"));
      const now = new Date();
      const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const batchMap: Record<string, any[]> = {};
      movSnap.forEach(d => {
        const m = d.data();
        if (!m.expiryDate || m.movementType !== "In") return;
        const expiry = new Date(m.expiryDate);
        if (expiry > in90Days) return;
        if (!batchMap[m.productId]) batchMap[m.productId] = [];
        batchMap[m.productId].push({
          expiryDate: m.expiryDate,
          quantity: m.quantity,
          expired: expiry < now,
          critical: expiry < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      });
      setProductBatches(batchMap);
    } finally {
      setLoading(false);
    }
  };

  const saveNewProduct = async () => {
    if (!newProduct.name.trim()) { alert("Product name is required"); return; }
    setAddingSaving(true);
    try {
      await addDoc(collection(db, "products"), {
        name: newProduct.name.trim(),
        productSubName: newProduct.productSubName || "",
        supplierId: newProduct.supplierId || "",
        supplier: newProduct.supplier || "",
        category: newProduct.category || "",
        origin: newProduct.origin || "",
        unit: newProduct.unit || "KG",
        storageType: newProduct.storageType || "",
        costPrice: Number(newProduct.costPrice || 0),
        b2bPrice: Number(newProduct.b2bPrice || 0),
        b2cPrice: Number(newProduct.b2cPrice || 0),
        minStock: Number(newProduct.minStock || 0),
        currentStock: 0,
        active: true,
        requiresWeighing: Boolean(newProduct.requiresWeighing),
        trackExpiry: Boolean(newProduct.trackExpiry),
        minWeightPerUnit: newProduct.minWeightPerUnit ? Number(newProduct.minWeightPerUnit) : null,
        maxWeightPerUnit: newProduct.maxWeightPerUnit ? Number(newProduct.maxWeightPerUnit) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setShowAddProduct(false);
      setNewProduct({ name: "", productSubName: "", supplierId: "", supplier: "", category: "", origin: "", unit: "KG", storageType: "", costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "", active: true, requiresWeighing: false, trackExpiry: false, minWeightPerUnit: "", maxWeightPerUnit: "" });
      await load();
    } finally {
      setAddingSaving(false);
    }
  };

  const startEdit = (product: any) => {
    setEditing(product.id);
    setEditData({ ...product });
  };

  const cancelEdit = () => { setEditing(null); setEditData({}); };

  const saveProduct = async (id: string) => {
    setSaving(id);
    try {
      const { id: _, ...data } = editData;
      // supplierId and supplier name both saved
      await updateDoc(doc(db, "products", id), {
        ...data,
        active: Boolean(editData.active),
        minStock: Number(editData.minStock || 0),
        minWeightPerUnit: editData.minWeightPerUnit ? Number(editData.minWeightPerUnit) : null,
        maxWeightPerUnit: editData.maxWeightPerUnit ? Number(editData.maxWeightPerUnit) : null,
        requiresWeighing: Boolean(editData.requiresWeighing || false),
        trackExpiry: Boolean(editData.trackExpiry || false),
        updatedAt: new Date().toISOString(),
      });
      setProducts(prev => prev.map(p => p.id === id ? { ...editData } : p));
      setEditing(null);
    } finally {
      setSaving(null);
    }
  };

  const saveOptions = async (field: string, newList: string[]) => {
    const updated = { ...options, [field]: newList };
    setOptions(updated);
    await setDoc(doc(db, "settings", "productOptions"), updated, { merge: true });
  };

  const loadHistory = async (product: any) => {
    setHistoryProduct(product);
    setHistoryLoading(true);
    try {
      const snap = await getDocs(collection(db, "stockMovements"));
      const movements = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => d.productId === product.id)
        .sort((a: any, b: any) => {
          const aDate = a.createdAt?.seconds || 0;
          const bDate = b.createdAt?.seconds || 0;
          return bDate - aDate;
        });
      setHistoryMovements(movements);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStockIn = async () => {
    if (!stockInProduct || !stockInQty || Number(stockInQty) <= 0) return;
    setStockInSaving(true);
    try {
      const qty = Number(stockInQty);
      await addDoc(collection(db, "stockMovements"), {
        productId: stockInProduct.id,
        productName: stockInProduct.name || "",
        quantity: qty,
        movementType: "In",
        source: "manual",
        notes: stockInNotes || "Manual stock addition",
        expiryDate: stockInExpiry || null,
        batchDate: new Date().toISOString().slice(0, 10),
        remainingQty: qty,
        movementDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      // Recalculate stock
      const movSnap = await getDocs(collection(db, "stockMovements"));
      const movements = movSnap.docs
        .map(d => d.data())
        .filter(d => d.productId === stockInProduct.id);
      const newStock = movements.reduce((sum, m) => {
        return m.movementType === "In" ? sum + Number(m.quantity) : sum - Number(m.quantity);
      }, 0);
      await updateDoc(doc(db, "products", stockInProduct.id), { currentStock: newStock });
      setProducts(prev => prev.map(p => p.id === stockInProduct.id ? { ...p, currentStock: newStock } : p));
      setStockInProduct(null);
      setStockInQty("");
      setStockInNotes("");
    } catch(e) {
      console.error(e);
      alert("Error adding stock");
    } finally {
      setStockInSaving(false);
    }
  };

  const addOption = async (field: string) => {
    const val = (newOption[field] || "").trim();
    if (!val) return;
    const list = options[field as keyof typeof options] as string[];
    if (list.includes(val)) return;
    const newList = [...list, val];
    await saveOptions(field, newList);
    setNewOption(prev => ({ ...prev, [field]: "" }));
  };

  const removeOption = async (field: string, val: string) => {
    const list = (options[field as keyof typeof options] as string[]).filter(v => v !== val);
    await saveOptions(field, list);
  };

  const filtered = products.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const storageColor: Record<string, string> = {
    Frozen: "bg-blue-100 text-blue-700",
    Refrigerated: "bg-cyan-100 text-cyan-700",
    Chilled: "bg-sky-100 text-sky-700",
    Fresh: "bg-green-100 text-green-700",
    Ambient: "bg-orange-100 text-orange-700",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Products</h1>
          <span className="text-xs text-gray-400">{products.length} products</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOptionsFor(showOptionsFor ? null : "unit")}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            ⚙️ Manage Dropdowns
          </button>
          <button
            onClick={() => setShowAddProduct(true)}
            className="px-4 py-1.5 text-sm text-white rounded-lg font-medium"
            style={{backgroundColor: "#1B2A5E"}}
          >
            + Add Product
          </button>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 w-48"
          />
        </div>
      </div>

      {/* Options Manager */}
      {showOptionsFor && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex gap-6">
            {(["unit", "storageType", "category", "origin"] as const).map(field => (
              <div key={field} className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{field}</p>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(options[field] as string[]).map(val => (
                    <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {val}
                      <button onClick={() => removeOption(field, val)} className="text-gray-400 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Add..."
                    value={newOption[field] || ""}
                    onChange={e => setNewOption(prev => ({ ...prev, [field]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addOption(field)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none"
                  />
                  <button onClick={() => addOption(field)} className="px-2 py-1 bg-gray-900 text-white text-xs rounded">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div key={product.id} className={`bg-white rounded-lg border transition-colors ${
              editing === product.id ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            } ${product.active === false ? "opacity-50" : ""}`}>

              {editing === product.id ? (
                /* EDIT MODE */
                <div className="space-y-3">
                  <div className="relative h-32 bg-gray-100 rounded-t-lg overflow-hidden group">
                    {editData.productImage ? (
                      <img src={editData.productImage} alt={editData.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">📷 No image</div>
                    )}
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden"
                      onChange={e => e.target.files && handleImageUpload(product.id, e.target.files[0])} />
                    <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage === product.id}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity disabled:opacity-50">
                      {uploadingImage === product.id ? "⏳ Uploading..." : "📸 Change Image"}
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    <input value={editData.name || ""} onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-semibold" />
                  <input value={editData.productSubName || ""} onChange={e => setEditData((p: any) => ({ ...p, productSubName: e.target.value }))}
                    placeholder="Sub name..." className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />

                  <select value={editData.supplierId || ""} onChange={e => {
                      const s = suppliers.find((s:any) => s.id === e.target.value);
                      setEditData((p: any) => ({ ...p, supplierId: e.target.value, supplier: s?.name || "" }));
                    }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                    <option value="">— Supplier —</option>
                    {suppliers.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <select value={editData.category || ""} onChange={e => setEditData((p: any) => ({ ...p, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Category</option>
                      {editData.category && !options.category.includes(editData.category) && <option value={editData.category}>{editData.category}</option>}
                      {options.category.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <select value={editData.origin || ""} onChange={e => setEditData((p: any) => ({ ...p, origin: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Origin</option>
                      {editData.origin && !options.origin.includes(editData.origin) && <option value={editData.origin}>{editData.origin}</option>}
                      {options.origin.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select value={editData.unit || ""} onChange={e => setEditData((p: any) => ({ ...p, unit: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Unit</option>
                      {editData.unit && !options.unit.includes(editData.unit) && <option value={editData.unit}>{editData.unit}</option>}
                      {options.unit.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <select value={editData.storageType || ""} onChange={e => setEditData((p: any) => ({ ...p, storageType: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Storage</option>
                      {editData.storageType && !options.storageType.includes(editData.storageType) && <option value={editData.storageType}>{editData.storageType}</option>}
                      {options.storageType.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="border-t pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Cost</label>
                        <input type="number" value={editData.costPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, costPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">B2B</label>
                        <input type="number" value={editData.b2bPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2bPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                        {editData.costPrice > 0 && editData.b2bPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                            {((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">B2C</label>
                        <input type="number" value={editData.b2cPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2cPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                        {editData.costPrice > 0 && editData.b2cPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                            {((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Min Stock</label>
                      <input type="number" value={editData.minStock || ""} onChange={e => setEditData((p: any) => ({ ...p, minStock: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={editData.active !== false} onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                        <span>Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => saveProduct(product.id)} disabled={saving === product.id}
                      className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50 font-medium">
                      {saving === product.id ? "..." : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="flex-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded hover:bg-gray-50 font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* VIEW MODE */
                <div className="space-y-3">
                  <div className="h-32 bg-gray-100 rounded-t-lg overflow-hidden flex items-center justify-center">
                    {product.productImage ? (
                      <img src={product.productImage} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-400 text-center">
                        <div className="text-3xl mb-1">📦</div>
                        <div className="text-xs">No image</div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                      {product.productSubName && <p className="text-xs text-gray-500">{product.productSubName}</p>}
                    </div>

                  <div className="flex flex-wrap gap-2">
                    {product.supplier && <span className="text-xs bg-gray-100 px-2 py-1 rounded">🏭 {product.supplier}</span>}
                    {product.category && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{product.category}</span>}
                    {product.origin && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{product.origin}</span>}
                  </div>

                  {product.requiresWeighing && <span className="text-xs text-purple-600 block">⚖️ Requires weighing</span>}
                  {product.trackExpiry && <span className="text-xs text-blue-600 block">📅 Track expiry</span>}

                  {productBatches[product.id]?.length > 0 && (
                    <div className="space-y-1">
                      {productBatches[product.id].map((batch, i) => (
                        <div key={i} className={`text-xs px-2 py-1 rounded ${
                          batch.expired ? "bg-red-100 text-red-700" :
                          batch.critical ? "bg-orange-100 text-orange-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {batch.expired ? "❌ Expired" : batch.critical ? "⚠️ Expiring" : "🟡 Soon"} {new Date(batch.expiryDate).toLocaleDateString("en-GB")}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-3 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Cost</p>
                      <p className="font-semibold text-gray-900">${formatPrice(product.costPrice || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">B2B</p>
                      <p className="font-semibold text-gray-900">${formatPrice(product.b2bPrice || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">B2C</p>
                      <p className="font-semibold text-gray-900">${formatPrice(product.b2cPrice || 0)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Stock</p>
                      <p className={Number(product.currentStock) <= Number(product.minStock || 0) && Number(product.minStock) > 0 ? "text-red-600 font-semibold" : "text-gray-900"}>
                        {formatQty(product.currentStock)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Min</p>
                      <p className="text-gray-900">{product.minStock || "—"}</p>
                    </div>
                  </div>

                  {showMarginsFor === product.id && product.costPrice > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">B2B Margin</p>
                        {product.b2bPrice > 0 ? (
                          <div className={`text-sm font-semibold ${((product.b2bPrice - product.costPrice) / product.b2bPrice * 100) < 10 ? "text-red-600" : "text-blue-600"}`}>
                            {((product.b2bPrice - product.costPrice) / product.b2bPrice * 100).toFixed(1)}%
                          </div>
                        ) : <p className="text-xs text-gray-400">No price set</p>}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">B2C Margin</p>
                        {product.b2cPrice > 0 ? (
                          <div className={`text-sm font-semibold ${((product.b2cPrice - product.costPrice) / product.b2cPrice * 100) < 15 ? "text-red-600" : "text-green-600"}`}>
                            {((product.b2cPrice - product.costPrice) / product.b2cPrice * 100).toFixed(1)}%
                          </div>
                        ) : <p className="text-xs text-gray-400">No price set</p>}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setShowMarginsFor(showMarginsFor === product.id ? null : product.id)}
                    className="w-full text-center text-xs text-gray-600 py-1 hover:text-gray-900 font-medium">
                    {showMarginsFor === product.id ? '▼ Hide margins' : '▶ Show margins'}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={() => startEdit(product)} className="flex-1 px-2 py-2 text-xs border border-gray-200 rounded hover:bg-gray-50 font-medium">
                      Edit
                    </button>
                    <button onClick={() => { setStockInProduct(product); setStockInQty(""); setStockInNotes(""); setStockInExpiry(""); }}
                      className="flex-1 px-2 py-2 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50 font-medium">
                      +Stock
                    </button>
                    <button onClick={() => loadHistory(product)}
                      className="flex-1 px-2 py-2 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 font-medium">
                      History
                    </button>
                  </div>
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Stock History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Stock History</h3>
                <p className="text-sm text-gray-500">{historyProduct.name}</p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {historyLoading ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
            ) : historyMovements.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No movements found</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-left px-3 py-2">Notes</th>
                      <th className="text-left px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyMovements.map((m: any) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.movementType === "In" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {m.movementType === "In" ? "↑ In" : "↓ Out"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatQty(m.quantity)}</td>
                        <td className="px-3 py-2 text-gray-500">{m.source || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{m.notes || "—"}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">
                          {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">Current stock: <span className="font-semibold text-gray-900">{formatQty(historyProduct.currentStock)}</span></span>
              <button onClick={() => setHistoryProduct(null)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Add New Product</h3>
              <button onClick={() => setShowAddProduct(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Product Name *</label>
                  <input value={newProduct.name} onChange={e => setNewProduct((p:any) => ({...p, name: e.target.value}))}
                    placeholder="e.g. Octopus Cooked Skin" autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Sub Name</label>
                  <input value={newProduct.productSubName} onChange={e => setNewProduct((p:any) => ({...p, productSubName: e.target.value}))}
                    placeholder="e.g. Scientific name or French name"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Supplier</label>
                  <select value={newProduct.supplierId} onChange={e => {
                    const s = suppliers.find((s:any) => s.id === e.target.value);
                    setNewProduct((p:any) => ({...p, supplierId: e.target.value, supplier: s?.name || ""}));
                  }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— Select Supplier —</option>
                    {suppliers.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Category</label>
                  <select value={newProduct.category} onChange={e => setNewProduct((p:any) => ({...p, category: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.category.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Origin</label>
                  <select value={newProduct.origin} onChange={e => setNewProduct((p:any) => ({...p, origin: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.origin.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                  <select value={newProduct.unit} onChange={e => setNewProduct((p:any) => ({...p, unit: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    {options.unit.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Storage Type</label>
                  <select value={newProduct.storageType} onChange={e => setNewProduct((p:any) => ({...p, storageType: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.storageType.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Cost Price ($)</label>
                  <input type="number" value={newProduct.costPrice} onChange={e => setNewProduct((p:any) => ({...p, costPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Min Stock</label>
                  <input type="number" value={newProduct.minStock} onChange={e => setNewProduct((p:any) => ({...p, minStock: e.target.value}))}
                    placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">B2B Price ($)</label>
                  <input type="number" value={newProduct.b2bPrice} onChange={e => setNewProduct((p:any) => ({...p, b2bPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {Number(newProduct.b2bPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                      Margin: {((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">B2C Price ($)</label>
                  <input type="number" value={newProduct.b2cPrice} onChange={e => setNewProduct((p:any) => ({...p, b2cPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {Number(newProduct.b2cPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                      Margin: {((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
              {(newProduct.unit === "KG" || newProduct.unit === "Piece") && (
                <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-amber-700">Weight range (kg):</span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Min</label>
                      <input type="number" step="0.01" value={newProduct.minWeightPerUnit}
                        onChange={e => setNewProduct((p:any) => ({...p, minWeightPerUnit: e.target.value}))}
                        className="w-20 border border-amber-200 rounded px-2 py-1 text-sm" placeholder="e.g. 0.9" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Max</label>
                      <input type="number" step="0.01" value={newProduct.maxWeightPerUnit}
                        onChange={e => setNewProduct((p:any) => ({...p, maxWeightPerUnit: e.target.value}))}
                        className="w-20 border border-amber-200 rounded px-2 py-1 text-sm" placeholder="e.g. 1.4" />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-1.5 text-xs text-purple-700 cursor-pointer">
                      <input type="checkbox" checked={!!newProduct.requiresWeighing}
                        onChange={e => setNewProduct((p:any) => ({...p, requiresWeighing: e.target.checked}))} />
                      ⚖️ Requires weighing at delivery
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                      <input type="checkbox" checked={!!newProduct.trackExpiry}
                        onChange={e => setNewProduct((p:any) => ({...p, trackExpiry: e.target.checked}))} />
                      📅 Track expiry / FIFO
                    </label>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddProduct(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveNewProduct} disabled={addingSaving || !newProduct.name.trim()}
                  className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  style={{backgroundColor: "#1B2A5E"}}>
                  {addingSaving ? "Saving..." : "Create Product"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {stockInProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Add Stock</h3>
            <p className="text-sm text-gray-500 mb-4">{stockInProduct.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Quantity to Add</label>
                <input type="number" min="0" step="0.001" value={stockInQty}
                  onChange={e => setStockInQty(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Notes (optional)</label>
                <input type="text" value={stockInNotes}
                  onChange={e => setStockInNotes(e.target.value)}
                  placeholder="e.g. Purchase from supplier"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              {stockInProduct?.trackExpiry && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                    📅 Expiry Date <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={stockInExpiry}
                    onChange={e => setStockInExpiry(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  {stockInExpiry && (
                    <p className={`text-xs mt-1 font-medium ${
                      new Date(stockInExpiry) < new Date() ? "text-red-700 font-bold" :
                      new Date(stockInExpiry) < new Date(Date.now() + 30*24*60*60*1000) ? "text-red-500" :
                      new Date(stockInExpiry) < new Date(Date.now() + 90*24*60*60*1000) ? "text-orange-500" :
                      "text-green-600"
                    }`}>
                      Expires: {new Date(stockInExpiry).toLocaleDateString("en-GB")}
                      {new Date(stockInExpiry) < new Date() ? " ❌ Already expired!" :
                       new Date(stockInExpiry) < new Date(Date.now() + 30*24*60*60*1000) ? " ⚠️ Expiring soon!" :
                       new Date(stockInExpiry) < new Date(Date.now() + 90*24*60*60*1000) ? " 🟡 Within 3 months" :
                       " ✅ Good"}
                    </p>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-400">Current stock: <span className="font-semibold text-gray-700">{formatQty(stockInProduct.currentStock)}</span> → After: <span className="font-semibold text-green-600">{formatQty(Number(stockInProduct.currentStock) + Number(stockInQty || 0))}</span></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStockInProduct(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleStockIn} disabled={stockInSaving || !stockInQty || Number(stockInQty) <= 0 || (stockInProduct?.trackExpiry && !stockInExpiry)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {stockInSaving ? "Saving..." : "Add Stock"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
  </div>
  );
}
