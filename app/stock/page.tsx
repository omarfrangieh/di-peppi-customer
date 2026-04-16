"use client";
import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [stockInProduct, setStockInProduct] = useState<any | null>(null);
  const [stockInQty, setStockInQty] = useState("");
  const [stockInNotes, setStockInNotes] = useState("");
  const [stockInExpiry, setStockInExpiry] = useState("");
  const [stockInSaving, setStockInSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expiryAlertOpen, setExpiryAlertOpen] = useState(true);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [prodSnap, movSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "stockMovements")),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMovements(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      batches.forEach(b => alerts.push({ productId, productName: product?.name || productId, ...b }));
    });
    return alerts.sort((a, b) => a.days - b.days);
  }, [expiryMap, products]);

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
            <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-gray-900" />
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
              className={"px-3 py-1.5 text-xs font-medium rounded-lg transition-colors " + (filterStatus === f.key ? "text-white" : "text-gray-500 bg-gray-100 hover:bg-gray-200")}
              style={filterStatus === f.key ? { backgroundColor: "#1B2A5E" } : {}}>
              {f.label}
            </button>
          ))}
          <div className="ml-auto text-xs text-gray-400">
            Stock Value: <span className="font-semibold text-gray-700">${stats.totalValue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-4 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "In Stock",          value: stats.ok,                            color: "text-green-600",  bg: "bg-green-50 border-green-200" },
            { label: "Low Stock",         value: stats.low,                           color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
            { label: "Out of Stock",      value: stats.out,                           color: "text-red-500",    bg: "bg-red-50 border-red-200" },
            { label: "Total Stock Value", value: "$" + stats.totalValue.toFixed(2),   color: "text-gray-900",   bg: "bg-white border-gray-200" },
          ].map(c => (
            <div key={c.label} className={"rounded-xl border p-4 " + c.bg}>
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={"text-2xl font-bold " + c.color}>{c.value}</p>
            </div>
          ))}
        </div>

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
                {filterStatus !== "all" && <p className="px-4 pt-1 pb-2 text-xs text-orange-400 italic">⚠ Expiry alerts are shown regardless of active filter</p>}
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
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(p.currentStock || 0).toFixed(3).replace(/\.?0+$/, "")}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{p.minStock || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-500">${Number(p.costPrice || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">${value.toFixed(2)}</td>
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
                        <button onClick={() => setStockInProduct(p)} className="text-xs px-2.5 py-1 text-white rounded-lg font-medium" style={{ backgroundColor: "#1B2A5E" }}>
                          + Stock
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={p.id + "-exp"}>
                        <td colSpan={10} className="px-8 py-4 bg-blue-50/40 border-t border-blue-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Movement History</p>
                          {pMovements.length === 0 ? <p className="text-xs text-gray-400">No movements recorded</p> : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {pMovements.slice(0, 20).map(m => (
                                <div key={m.id} className="flex items-center gap-4 text-xs">
                                  <span className="text-gray-400 w-24">{m.movementDate || "—"}</span>
                                  <span className={"font-semibold w-12 " + (m.movementType === "In" ? "text-green-600" : "text-red-500")}>
                                    {m.movementType === "In" ? "+" : "-"}{Number(m.quantity || 0).toFixed(2).replace(/\.?0+$/, "")}
                                  </span>
                                  <span className={"px-1.5 py-0.5 rounded text-xs font-medium " + (m.movementType === "In" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600")}>{m.movementType}</span>
                                  {m.expiryDate && (
                                    <span className="text-orange-500">
                                      Exp: {m.expiryDate.split("-").reverse().join("/")}
                                      <span className="text-gray-400 ml-1">({daysUntil(m.expiryDate)}d left)</span>
                                    </span>
                                  )}
                                  {m.notes && <span className="text-gray-400">{m.notes}</span>}
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
                <span className="font-semibold text-gray-700">{Number(stockInProduct.currentStock || 0).toFixed(3).replace(/\.?0+$/, "")} {stockInProduct.unit || ""}</span>
              </div>
              {stockInQty && Number(stockInQty) > 0 && (
                <div className="bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700 flex justify-between">
                  <span>After adding</span>
                  <span className="font-semibold">{(Number(stockInProduct.currentStock || 0) + Number(stockInQty)).toFixed(3).replace(/\.?0+$/, "")} {stockInProduct.unit || ""}</span>
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
