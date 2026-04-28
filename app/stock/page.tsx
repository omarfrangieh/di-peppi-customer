"use client";
import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatQty, formatPrice } from "@/lib/formatters";
import SearchInput from "@/components/SearchInput";

function AdjustModal({ product, onClose, onSave }: { product: any; onClose: () => void; onSave: (newQty: number, delta: number, reason: string, notes: string) => Promise<void> }) {
  const [qty, setQty] = useState(String(product.currentStock || 0));
  const [reason, setReason] = useState("error");
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedQty = qty === "" ? NaN : Number(qty);
  const current = Number(product.currentStock || 0);
  const delta = isNaN(parsedQty) ? 0 : parsedQty - current;
  const canConfirm = !saving && qty !== "" && !isNaN(parsedQty) && parsedQty >= 0 && parsedQty !== current && !(reason === "other" && !otherReason.trim());

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      const finalReason = reason === "other" ? otherReason.trim() : reason;
      await onSave(parsedQty, delta, finalReason, notes);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-bold text-gray-900 mb-1">Adjust Stock</h3>
        <p className="text-sm text-gray-500 mb-4">{product.name}</p>
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex justify-between">
            <span>Current stock</span>
            <span className="font-semibold text-gray-700">{formatQty(product.currentStock)} {product.unit || ""}</span>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Corrected Quantity ({product.unit || "units"})</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} autoFocus
              placeholder={String(product.currentStock || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          {qty !== "" && !isNaN(parsedQty) && parsedQty !== current && (
            <div className={`rounded-lg px-3 py-2 text-xs flex justify-between ${delta > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              <span>Variance</span>
              <span className="font-semibold">{delta > 0 ? "+" : ""}{formatQty(delta)} {product.unit || ""}</span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              {["error", "damaged", "theft", "shrinkage", "expired", "found", "other"].map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>
          {reason === "other" && (
            <input type="text" placeholder="Specify reason..." value={otherReason} onChange={e => setOtherReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          )}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleConfirm} disabled={!canConfirm}
              className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40" style={{ backgroundColor: "#B5535A" }}>
              {saving ? "Saving..." : "Confirm Adjustment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function stockStatus(p: any) {
  const cur = Number(p.currentStock || 0);
  const min = Number(p.minStock || 0);
  if (cur <= 0) return "out";
  if (min > 0 && cur <= min) return "low";
  return "ok";
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryColor(days: number) {
  if (days < 0)   return { badge: "bg-red-100 text-red-700",      dot: "🔴", label: "Expired" };
  if (days <= 30) return { badge: "bg-red-100 text-red-700",      dot: "🔴", label: `${days}d` };
  if (days <= 60) return { badge: "bg-orange-100 text-orange-600", dot: "🟡", label: `${days}d` };
  return           { badge: "bg-yellow-50 text-yellow-700",       dot: "🟡", label: `${days}d` };
}

export default function StockPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ok");
  const [sortBy, setSortBy] = useState("name");
  const [stockInProduct, setStockInProduct] = useState<any | null>(null);
  const [stockInQty, setStockInQty] = useState("");
  const [stockInNotes, setStockInNotes] = useState("");
  const [stockInExpiry, setStockInExpiry] = useState("");
  const [stockInSaving, setStockInSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expiryAlertOpen, setExpiryAlertOpen] = useState(true);
  const [inventoryCounts, setInventoryCounts] = useState<any[]>([]);
  const [currentCountId, setCurrentCountId] = useState<string | null>(null);
  const [countItems, setCountItems] = useState<any[]>([]);
  const [showNewCountModal, setShowNewCountModal] = useState(false);
  const [newCountDate, setNewCountDate] = useState(new Date().toISOString().split("T")[0]);
  const [newCountNotes, setNewCountNotes] = useState("");
  const [countSearch, setCountSearch] = useState("");
  const [showCountReview, setShowCountReview] = useState(false);
  const [countSaving, setCountSaving] = useState(false);
  const [showCountHistory, setShowCountHistory] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemQty, setEditItemQty] = useState("");
  const [countVarianceSummary, setCountVarianceSummary] = useState({plus: 0, minus: 0});
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [selectedCountItems, setSelectedCountItems] = useState<any[]>([]);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonModalData, setReasonModalData] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");
  const [expiredDate, setExpiredDate] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editQty, setEditQty] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editExpiredDate, setEditExpiredDate] = useState("");
  const [adjustProduct, setAdjustProduct] = useState<any | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [prodSnap, movSnap, countsSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "stockMovements")),
        getDocs(collection(db, "inventoryCounts")),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMovements(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInventoryCounts((countsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]).sort((a, b) => String(b.countDate || "").localeCompare(String(a.countDate || ""))));
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    let list = products.filter(p => p.active !== false);
    if (search) list = list.filter(p => (p.name || "").toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== "all") list = list.filter(p => stockStatus(p) === filterStatus);
    list.sort((a, b) => {
      if (sortBy === "stock") return Number(a.currentStock || 0) - Number(b.currentStock || 0);
      if (sortBy === "value") return (Number(b.currentStock || 0) * Number(b.costPrice || 0)) - (Number(a.currentStock || 0) * Number(a.costPrice || 0));
      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  }, [products, search, filterStatus, sortBy]);

  const stats = useMemo(() => ({
    ok: products.filter(p => p.active !== false && stockStatus(p) === "ok").length,
    low: products.filter(p => p.active !== false && stockStatus(p) === "low").length,
    out: products.filter(p => p.active !== false && stockStatus(p) === "out").length,
    totalValue: products.filter(p => p.active !== false).reduce((s, p) => s + Number(p.currentStock || 0) * Number(p.costPrice || 0), 0),
  }), [products]);

  const expiryMap = useMemo(() => {
    const map: Record<string, { date: string; qty: number; days: number }[]> = {};
    movements
      .filter(m => m.movementType === "In" && m.expiryDate)
      .forEach(m => {
        const days = daysUntil(m.expiryDate);
        if (days <= 90) {
          if (!map[m.productId]) map[m.productId] = [];
          map[m.productId].push({ date: m.expiryDate, qty: Number(m.quantity || 0), days });
        }
      });
    Object.keys(map).forEach(k => map[k].sort((a, b) => a.days - b.days));
    return map;
  }, [movements]);

  const expiryAlerts = useMemo(() => {
    const alerts: { productId: string; productName: string; date: string; qty: number; days: number }[] = [];
    Object.entries(expiryMap).forEach(([productId, batches]) => {
      const product = products.find(p => p.id === productId);
      if (!product) return;
      if (filterStatus !== "all" && stockStatus(product) !== filterStatus) return;
      batches.forEach(b => alerts.push({ productId, productName: product?.name || productId, ...b }));
    });
    return alerts.sort((a, b) => a.days - b.days);
  }, [expiryMap, products, filterStatus]);

  const handleStockIn = async () => {
    if (!stockInProduct || !stockInQty || Number(stockInQty) <= 0) return;
    setStockInSaving(true);
    try {
      const qty = Number(stockInQty);
      const newStock = Number(stockInProduct.currentStock || 0) + qty;
      await updateDoc(doc(db, "products", stockInProduct.id), { currentStock: newStock, updatedAt: new Date().toISOString() });
      await addDoc(collection(db, "stockMovements"), {
        productId: stockInProduct.id, productName: stockInProduct.name,
        movementType: "In", movementSource: "Manual", quantity: qty,
        notes: stockInNotes, expiryDate: stockInExpiry || null,
        movementDate: new Date().toISOString().slice(0, 10), createdAt: serverTimestamp(),
      });
      setProducts(prev => prev.map(p => p.id === stockInProduct.id ? { ...p, currentStock: newStock } : p));
      setStockInProduct(null); setStockInQty(""); setStockInNotes(""); setStockInExpiry("");
      await load();
    } finally { setStockInSaving(false); }
  };

  const handleAdjustSave = async (newQty: number, delta: number, reason: string, notes: string) => {
    if (!adjustProduct) return;
    await updateDoc(doc(db, "products", adjustProduct.id), { currentStock: newQty, updatedAt: new Date().toISOString() });
    await addDoc(collection(db, "stockMovements"), {
      productId: adjustProduct.id, productName: adjustProduct.name,
      movementType: delta > 0 ? "In" : "Out",
      movementSource: "correction",
      quantity: Math.abs(delta),
      notes: [reason, notes].filter(Boolean).join(" — "),
      movementDate: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
    });
    setAdjustProduct(null);
    await load();
  };

  const handleDeleteMovement = async (movementId: string, productId: string) => {
    if (!window.confirm("Remove this stock movement? The stock will be recalculated automatically.")) return;
    await deleteDoc(doc(db, "stockMovements", movementId));
    setMovements(prev => prev.filter(m => m.id !== movementId));
    await load();
  };

  const handleCreateCount = async () => {
    if (!newCountDate) return;
    setCountSaving(true);
    try {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/lib/firebase");
      const createInventoryCount = httpsCallable(functions, "createInventoryCount");
      const result: any = await createInventoryCount({countDate: newCountDate, notes: newCountNotes});
      setCurrentCountId(result.data.countId);
      setCountItems([]);
      setShowNewCountModal(false);
      setNewCountNotes("");
    } catch (err) {
      alert("Error creating count: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally { setCountSaving(false); }
  };

  const handleAddCountItem = async (product: any) => {
    if (!currentCountId || !product) return;
    const counted = window.prompt("Enter counted quantity for " + product.name + ":", formatQty(product.currentStock));
    if (counted === null || !counted.trim()) return;
    const countedQty = Number(counted);
    if (isNaN(countedQty) || countedQty < 0) { alert("Invalid quantity"); return; }
    setReasonModalData({product, countedQty});
    setSelectedReason("error");
    setOtherReason("");
    setShowReasonModal(true);
  };

  const handleConfirmReason = async () => {
    if (!reasonModalData || !selectedReason) return;
    if (selectedReason === "expired" && !expiredDate) { alert("Please select expiry date"); return; }
    if (selectedReason === "other" && !otherReason) { alert("Please specify reason"); return; }

    const {product, countedQty} = reasonModalData;
    const finalReason = selectedReason === "other" ? otherReason : selectedReason;
    setCountSaving(true);
    try {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/lib/firebase");
      const addInventoryCountItem = httpsCallable(functions, "addInventoryCountItem");
      const result: any = await addInventoryCountItem({
        countId: currentCountId, productId: product.id, countedStock: countedQty,
        adjustmentReason: finalReason || "", notes: notes || "", expiryDate: product.trackExpiry || selectedReason === "expired" ? expiredDate : null
      });
      const newItem = {id: result.data.countItemId, productId: product.id, ...result.data};
      setCountItems(prev => [...prev, newItem]);
      setCountVarianceSummary(prev => ({
        plus: prev.plus + (result.data.variance > 0 ? result.data.variance : 0),
        minus: prev.minus + (result.data.variance < 0 ? Math.abs(result.data.variance) : 0)
      }));
      setShowReasonModal(false);
      setReasonModalData(null);
      setNotes("");
      setExpiredDate("");
    } catch (err) {
      alert("Error adding item: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally { setCountSaving(false); }
  };

  const handleDeleteCountItem = (itemId: string) => {
    const item = countItems.find(i => i.id === itemId);
    if (!item || !window.confirm("Delete this count item?")) return;
    setCountItems(prev => prev.filter(i => i.id !== itemId));
    setCountVarianceSummary(prev => ({
      plus: prev.plus - (item.variance > 0 ? item.variance : 0),
      minus: prev.minus - (item.variance < 0 ? Math.abs(item.variance) : 0)
    }));
  };

  const handleCloseCount = () => {
    if (countItems.length > 0 && !window.confirm("Close count with " + countItems.length + " items? You can resume it later.")) return;
    setCurrentCountId(null);
    setCountItems([]);
    setCountVarianceSummary({plus: 0, minus: 0});
  };

  const handleConsolidateCount = async () => {
    if (!currentCountId) return;
    const hasVariance = countItems.some(i => i.variance !== 0);
    if (!hasVariance) {
      alert("No variances to consolidate. All counts match system stock.");
      return;
    }
    if (!window.confirm("Consolidate count? This will apply all adjustments to stock. This action cannot be undone.")) return;
    setCountSaving(true);
    try {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/lib/firebase");
      const consolidateInventoryCount = httpsCallable(functions, "consolidateInventoryCount");
      const result: any = await consolidateInventoryCount({countId: currentCountId});
      alert("Count consolidated! Applied " + result.data.adjustmentsApplied + " adjustments.");
      setCurrentCountId(null);
      setCountItems([]);
      setShowCountReview(false);
      setCountVarianceSummary({plus: 0, minus: 0});
      await load();
    } catch (err) {
      alert("Error consolidating: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally { setCountSaving(false); }
  };

  const handleViewCountDetails = async (countId: string) => {
    try {
      const itemsSnap = await getDocs(collection(db, "inventoryCountItems"));
      const items = (itemsSnap.docs
        .map(d => ({ id: d.id, ...d.data() })) as any[])
        .filter(i => i.countId === countId);
      setSelectedCountId(countId);
      setSelectedCountItems(items);
    } catch (err) {
      alert("Error loading count details: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleStartEdit = (item: any) => {
    setEditingItem(item);
    setEditQty(String(item.countedStock));
    setEditReason(item.adjustmentReason || "");
    setEditNotes(item.notes || "");
    setEditExpiredDate(item.expiryDate || "");
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editQty) return;
    const editedQty = Number(editQty);
    if (isNaN(editedQty) || editedQty < 0) { alert("Invalid quantity"); return; }

    const newVariance = editedQty - editingItem.systemStock;
    const oldVariance = editingItem.variance;

    setSelectedCountItems(prev => prev.map(i =>
      i.id === editingItem.id
        ? {...i, countedStock: editedQty, variance: newVariance, adjustmentReason: editReason, notes: editNotes, expiryDate: editExpiredDate}
        : i
    ));

    setCountVarianceSummary(prev => ({
      plus: prev.plus - (oldVariance > 0 ? oldVariance : 0) + (newVariance > 0 ? newVariance : 0),
      minus: prev.minus - (oldVariance < 0 ? Math.abs(oldVariance) : 0) + (newVariance < 0 ? Math.abs(newVariance) : 0)
    }));

    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleDeleteCount = (countId: string) => {
    if (!window.confirm("Delete this entire count? This action cannot be undone.")) return;
    setInventoryCounts(prev => prev.filter(c => c.id !== countId));
    setSelectedCountId(null);
    setSelectedCountItems([]);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Stock</h1>
            <span className="text-sm text-gray-400">{filtered.length} products</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="name">Sort: Name</option>
              <option value="stock">Sort: Stock Level</option>
              <option value="value">Sort: Stock Value</option>
            </select>
            <SearchInput
              placeholder="Search products..."
              value={search}
              onChange={setSearch}
              className="w-48"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: "all",  label: "All (" + products.filter(p => p.active !== false).length + ")" },
            { key: "ok",   label: "✅ In Stock (" + stats.ok + ")" },
            { key: "low",  label: "⚠️ Low Stock (" + stats.low + ")" },
            { key: "out",  label: "❌ Out of Stock (" + stats.out + ")" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={"px-4 py-2 text-sm font-medium rounded-lg transition-colors " + (filterStatus === f.key ? "text-white" : "text-gray-500 bg-gray-100 hover:bg-gray-200")}
              style={filterStatus === f.key ? { backgroundColor: "#1B2A5E" } : {}}>
              {f.label}
            </button>
          ))}
          <div className="ml-auto text-sm text-gray-600">
            Stock Value: <span className="font-semibold text-gray-900">${formatPrice(stats.totalValue)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-4 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "In Stock",          value: stats.ok,                            color: "text-green-600",  bg: "bg-green-50 border-green-200" },
            { label: "Low Stock",         value: stats.low,                           color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
            { label: "Out of Stock",      value: stats.out,                           color: "text-red-500",    bg: "bg-red-50 border-red-200" },
            { label: "Total Stock Value", value: "$" + formatPrice(stats.totalValue),   color: "text-gray-900",   bg: "bg-white border-gray-200" },
          ].map(c => (
            <div key={c.label} className={"rounded-xl border p-4 " + c.bg}>
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={"text-2xl font-bold " + c.color}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Physical Count Section */}
        {currentCountId ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">📋 Physical Count In Progress</h2>
              <button onClick={handleCloseCount} className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-100">Close</button>
            </div>

            {/* Variance Summary */}
            {countItems.length > 0 && (
              <div className="grid grid-cols-3 gap-2 text-xs bg-white rounded-lg p-2">
                <div className="text-center">
                  <p className="text-gray-600">Counted</p>
                  <p className="font-semibold text-gray-900">{countItems.length}</p>
                </div>
                <div className="text-center border-l border-r border-gray-200">
                  <p className="text-gray-600">+Units</p>
                  <p className="font-semibold text-green-600">+{countVarianceSummary.plus}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">-Units</p>
                  <p className="font-semibold text-red-600">-{countVarianceSummary.minus}</p>
                </div>
              </div>
            )}

            {/* Counted Items List */}
            {countItems.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto bg-white rounded-lg p-2">
                {countItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs p-2 border border-blue-100 rounded bg-blue-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.productName}</p>
                      <p className="text-gray-500">Sys: {formatQty(item.systemStock)} | Cnt: {formatQty(item.countedStock)}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <span className={`px-1.5 py-0.5 rounded-full font-semibold ${item.variance > 0 ? "bg-green-100 text-green-700" : item.variance < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                        {item.variance === 0 ? "✓" : item.variance > 0 ? "+" : ""}{item.variance}
                      </span>
                      <button onClick={() => handleDeleteCountItem(item.id)} className="text-red-500 hover:text-red-700 font-bold">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Products Section */}
            <div>
              <p className="text-xs text-gray-600 mb-2">Add more products to count:</p>
              <SearchInput
                placeholder="Search products..."
                value={countSearch}
                onChange={setCountSearch}
                className="w-full mb-2"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {filtered.filter(p => !countItems.some(i => i.productId === p.id) && (!countSearch || p.name.toLowerCase().includes(countSearch.toLowerCase()))).map(p => (
                  <button key={p.id} onClick={() => handleAddCountItem(p)} className="px-2 py-1.5 text-xs border border-blue-300 bg-white text-blue-700 rounded hover:bg-blue-100 text-left">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-gray-500">Sys: {formatQty(p.currentStock)}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {countItems.length > 0 && (
                <button onClick={() => setShowCountReview(true)} className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium" style={{backgroundColor: "#1B2A5E"}}>
                  Review & Consolidate
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowNewCountModal(true)} className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium" style={{backgroundColor: "#1B2A5E"}}>
              📋 Start Physical Count
            </button>
            {inventoryCounts.length > 0 && (
              <button onClick={() => setShowCountHistory(true)} className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                📜 History
              </button>
            )}
          </div>
        )}

        {/* New Count Modal */}
        {showNewCountModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-base font-bold text-gray-900 mb-4">New Physical Count</h3>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Count Date</label>
                  <input type="date" value={newCountDate} onChange={e => setNewCountDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Notes (optional)</label>
                  <input type="text" placeholder="Count notes..." value={newCountNotes} onChange={e => setNewCountNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowNewCountModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreateCount} disabled={countSaving} className="flex-1 px-4 py-2 text-white text-sm rounded font-medium disabled:opacity-50" style={{backgroundColor: "#1B2A5E"}}>
                  {countSaving ? "Creating..." : "Start Count"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Count Review Modal */}
        {showCountReview && currentCountId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 my-8">
              <h3 className="text-base font-bold text-gray-900 mb-4">Review & Consolidate Count</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
                {countItems.map(item => (
                  <div key={item.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                        <p className="text-xs text-gray-600">System: {formatQty(item.systemStock)} | Counted: {formatQty(item.countedStock)} | Variance: {item.variance > 0 ? "+" : ""}{formatQty(item.variance)}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${item.variance > 0 ? "bg-green-100 text-green-700" : item.variance < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                        {item.variance === 0 ? "Match" : item.variance > 0 ? "+" : ""}{formatQty(item.variance)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCountReview(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Cancel</button>
                <button onClick={handleConsolidateCount} disabled={countSaving} className="flex-1 px-4 py-2 text-white text-sm rounded font-medium disabled:opacity-50" style={{backgroundColor: "#1B2A5E"}}>
                  {countSaving ? "Consolidating..." : "Confirm Consolidation"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Adjustment Reason Modal */}
        {showReasonModal && reasonModalData && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 my-8">
              <h3 className="text-base font-bold text-gray-900 mb-2">Adjustment Reason</h3>
              <p className="text-sm text-gray-600 mb-4">{reasonModalData.product.name}</p>
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {["damaged", "theft", "error", "shrinkage", "expired", "found", "other"].map(reason => (
                  <label key={reason} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="reason" value={reason} checked={selectedReason === reason} onChange={e => setSelectedReason(e.target.value)} className="cursor-pointer" />
                    <span className="text-sm font-medium text-gray-700 capitalize">{reason}</span>
                  </label>
                ))}
              </div>

              {selectedReason === "expired" && (
                <div className="mb-4 p-3 border border-orange-200 bg-orange-50 rounded-lg">
                  <label className="text-xs text-gray-600 block mb-2">Expiry Date (must be in past)</label>
                  <input type="date" max={new Date().toISOString().split("T")[0]} value={expiredDate} onChange={e => setExpiredDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              )}

              {selectedReason === "other" && (
                <div className="mb-4">
                  <input type="text" placeholder="Specify reason..." value={otherReason} onChange={e => setOtherReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-gray-600 block mb-2">Notes (optional)</label>
                <textarea placeholder="Add any additional notes..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setShowReasonModal(false); setNotes(""); setExpiredDate(""); }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Cancel</button>
                <button onClick={handleConfirmReason} disabled={countSaving || (selectedReason === "expired" && !expiredDate) || (selectedReason === "other" && !otherReason)} className="flex-1 px-4 py-2 text-white text-sm rounded font-medium disabled:opacity-50" style={{backgroundColor: "#1B2A5E"}}>
                  {countSaving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Count Item Modal */}
        {showEditModal && editingItem && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 my-8">
              <h3 className="text-base font-bold text-gray-900 mb-4">Edit Count Item</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Product</label>
                  <p className="text-sm font-medium text-gray-900">{editingItem.productName}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Counted Quantity</label>
                  <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Adjustment Reason</label>
                  <select value={editReason} onChange={e => setEditReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Select reason</option>
                    {["damaged", "theft", "error", "shrinkage", "expired", "found", "other"].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                {editReason === "expired" && (
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Expiry Date</label>
                    <input type="date" max={new Date().toISOString().split("T")[0]} value={editExpiredDate} onChange={e => setEditExpiredDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Notes (optional)</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-16 resize-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveEdit} disabled={!editQty} className="flex-1 px-4 py-2 text-white text-sm rounded font-medium disabled:opacity-50" style={{backgroundColor: "#1B2A5E"}}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Count History Modal */}
        {showCountHistory && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl mx-4 my-8">
              {selectedCountId ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900">Count Details</h3>
                    <button onClick={() => setSelectedCountId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
                    {selectedCountItems.length === 0 ? (
                      <p className="text-sm text-gray-500">No items in this count</p>
                    ) : (
                      selectedCountItems.map(item => (
                        <div key={item.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                              <p className="text-xs text-gray-600 mt-1">System: {formatQty(item.systemStock)} | Counted: {formatQty(item.countedStock)} | Variance: {item.variance > 0 ? "+" : ""}{formatQty(item.variance)}</p>
                              {item.adjustmentReason && <p className="text-xs text-gray-500 mt-1">Reason: {item.adjustmentReason}</p>}
                              {item.notes && <p className="text-xs text-gray-500">Notes: {item.notes}</p>}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${item.variance > 0 ? "bg-green-100 text-green-700" : item.variance < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                                {item.variance === 0 ? "Match" : item.variance > 0 ? "+" : ""}{formatQty(item.variance)}
                              </span>
                              <button onClick={() => handleStartEdit(item)} className="text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 border border-blue-200 rounded">Edit</button>
                              <button onClick={() => {
                                if (window.confirm("Delete this item?")) {
                                  setSelectedCountItems(prev => prev.filter(i => i.id !== item.id));
                                  const oldVar = item.variance;
                                  setCountVarianceSummary(prev => ({
                                    plus: prev.plus - (oldVar > 0 ? oldVar : 0),
                                    minus: prev.minus - (oldVar < 0 ? Math.abs(oldVar) : 0)
                                  }));
                                }
                              }} className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1 border border-red-200 rounded">Delete</button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedCountId(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Back</button>
                    <button onClick={() => handleDeleteCount(selectedCountId)} className="flex-1 px-4 py-2 border border-red-300 text-red-600 text-sm rounded hover:bg-red-50 font-medium">Delete Count</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-bold text-gray-900 mb-4">📜 Inventory Count History</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                    {inventoryCounts.length === 0 ? (
                      <p className="text-sm text-gray-500">No count history</p>
                    ) : (
                      inventoryCounts.map(count => (
                        <button key={count.id} onClick={() => handleViewCountDetails(count.id)} className="w-full text-left p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {new Date(count.countDate).toLocaleDateString('en-CA')}
                                {count.notes && <span className="text-gray-500 ml-2">— {count.notes}</span>}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Status: <span className={`font-semibold ${count.status === "consolidated" ? "text-green-600" : "text-yellow-600"}`}>
                                  {count.status === "consolidated" ? "✓ Consolidated" : "In Progress"}
                                </span>
                              </p>
                            </div>
                            <span className="text-gray-400">→</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCountHistory(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {expiryAlerts.length > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpiryAlertOpen(o => !o)}>
              <div className="flex items-center gap-2">
                <span className="text-base">📅</span>
                <span className="text-sm font-semibold text-orange-800">Expiry Alerts</span>
                <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">
                  {expiryAlerts.length} {expiryAlerts.length === 1 ? "batch" : "batches"}
                </span>
              </div>
              <span className={"text-orange-400 transition-transform text-xs " + (expiryAlertOpen ? "rotate-180" : "")}>▼</span>
            </button>
            {expiryAlertOpen && (
              <div>

                <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {expiryAlerts.map((a, i) => {
                    const { badge, dot } = expiryColor(a.days);
                    return (
                      <div key={i} className="bg-white rounded-lg border border-orange-100 px-3 py-2.5 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-gray-800">{a.productName}</p>
                        <p className="text-xs text-gray-400">Qty: {a.qty}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span>{dot}</span>
                          <span className={"text-xs font-semibold px-1.5 py-0.5 rounded " + badge}>
                            {a.days < 0 ? "Expired" : a.date.split("-").reverse().join("/")}
                          </span>
                          {a.days >= 0 && <span className="text-xs text-gray-400">{a.days}d left</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Product", "Supplier", "Unit", "Current Stock", "Min Stock", "Cost", "Stock Value", "Status", "Expiry", ""].map((h, i) => (
                  <th key={h + i} className={"px-4 py-3 text-xs font-medium text-gray-500 uppercase " + (i === 0 || i === 1 ? "text-left" : i >= 7 ? "text-center" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => {
                const status = stockStatus(p);
                const value = Number(p.currentStock || 0) * Number(p.costPrice || 0);
                const expiries = expiryMap[p.id] || [];
                const soonest = expiries[0];
                const isExpanded = expandedId === p.id;
                const pMovements = movements.filter(m => m.productId === p.id).sort((a, b) => String(b.movementDate || "").localeCompare(String(a.movementDate || "")));
                return (
                  <React.Fragment key={p.id}>
                    <tr className={"hover:bg-gray-50 transition-colors " + (isExpanded ? "bg-blue-50/30" : "")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExpandedId(isExpanded ? null : p.id)} className="text-gray-400 hover:text-gray-600">
                            <span className={"inline-block transition-transform " + (isExpanded ? "rotate-90" : "")}>▶</span>
                          </button>
                          <div>
                            <p className="font-medium text-gray-900">{p.name}</p>
                            {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.supplier || "—"}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{p.unit || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatQty(p.currentStock)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{p.minStock || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-500">${formatPrice(p.costPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">${formatPrice(value)}</td>
                      <td className="px-4 py-3 text-center">
                        {status === "ok"  && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ OK</span>}
                        {status === "low" && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">⚠️ Low</span>}
                        {status === "out" && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">❌ Out</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {soonest ? (() => {
                          const { badge, dot } = expiryColor(soonest.days);
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + badge}>
                                {dot} {soonest.date.split("-").reverse().join("/")}
                              </span>
                              <span className="text-xs text-gray-400">{soonest.days < 0 ? "Expired" : `${soonest.days}d left`}</span>
                            </div>
                          );
                        })() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setStockInProduct(p)} className="px-3 py-2 text-sm text-white rounded-lg font-medium whitespace-nowrap" style={{ backgroundColor: "#22863a" }}>
                            + Stock
                          </button>
                          <button onClick={() => setAdjustProduct(p)}
                            className="px-3 py-2 text-sm text-white rounded-lg font-medium" style={{ backgroundColor: "#1B2A5E" }}>
                            Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={p.id + "-exp"}>
                        <td colSpan={10} className="px-8 py-4 bg-blue-50/40 border-t border-blue-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Movement History</p>
                          {pMovements.length === 0 ? <p className="text-xs text-gray-400">No movements recorded</p> : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {pMovements.slice(0, 20).map(m => (
                                <div key={m.id} className="flex items-center gap-4 text-xs group">
                                  <span className="text-gray-400 w-24">{m.movementDate ? (m.movementDate.toDate?.() || new Date(m.movementDate)).toLocaleDateString('en-CA') : "—"}</span>
                                  <span className={"font-semibold w-12 " + (m.movementType === "In" ? "text-green-600" : "text-red-500")}>
                                    {m.movementType === "In" ? "+" : "-"}{formatQty(m.quantity)}
                                  </span>
                                  <span className={"px-1.5 py-0.5 rounded text-xs font-medium " + (m.movementType === "In" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600")}>{m.movementType}</span>
                                  {m.movementSource === "correction" && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">correction</span>}
                                  {m.expiryDate && (
                                    <span className="text-orange-500">
                                      Exp: {m.expiryDate.split("-").reverse().join("/")}
                                      <span className="text-gray-400 ml-1">({daysUntil(m.expiryDate)}d left)</span>
                                    </span>
                                  )}
                                  {m.notes && <span className="text-gray-400">{m.notes}</span>}
                                  <button
                                    onClick={() => handleDeleteMovement(m.id, m.productId)}
                                    className="ml-auto opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity px-1"
                                    title="Remove movement"
                                  >✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No products match your filters</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {adjustProduct && (
        <AdjustModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSave={handleAdjustSave}
        />
      )}

      {stockInProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-bold text-gray-900 mb-1">+ Add Stock</h3>
            <p className="text-sm text-gray-500 mb-4">{stockInProduct.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Quantity ({stockInProduct.unit || "units"})</label>
                <input type="number" value={stockInQty} onChange={e => setStockInQty(e.target.value)} placeholder="0" autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              {stockInProduct.trackExpiry && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Expiry Date</label>
                  <input type="date" value={stockInExpiry} onChange={e => setStockInExpiry(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Notes (optional)</label>
                <input type="text" value={stockInNotes} onChange={e => setStockInNotes(e.target.value)} placeholder="Supplier delivery, batch ref..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex justify-between">
                <span>Current stock</span>
                <span className="font-semibold text-gray-700">{formatQty(stockInProduct.currentStock)} {stockInProduct.unit || ""}</span>
              </div>
              {stockInQty && Number(stockInQty) > 0 && (
                <div className="bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700 flex justify-between">
                  <span>After adding</span>
                  <span className="font-semibold">{formatQty(Number(stockInProduct.currentStock || 0) + Number(stockInQty))} {stockInProduct.unit || ""}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setStockInProduct(null); setStockInQty(""); setStockInNotes(""); setStockInExpiry(""); }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleStockIn} disabled={stockInSaving || !stockInQty || Number(stockInQty) <= 0}
                  className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40" style={{ backgroundColor: "#1B2A5E" }}>
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
