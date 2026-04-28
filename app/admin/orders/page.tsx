"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, doc, writeBatch, serverTimestamp, where, addDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { X, Trash2, ArrowUpDown, ChevronRight } from "lucide-react";

const STATUS_FLOW: Record<string, string> = {
  Draft:        "Confirmed",
  Confirmed:    "Preparing",
  Preparing:    "To Deliver",
  "To Deliver": "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  Draft:        "bg-gray-100 text-gray-600",
  Confirmed:    "bg-blue-100 text-blue-700 border border-blue-200",
  Preparing:    "bg-yellow-100 text-yellow-800 border border-yellow-300",
  "To Deliver": "bg-orange-100 text-orange-700 border border-orange-300",
  Delivered:    "bg-green-100 text-green-800 border border-green-300",
  Cancelled:    "bg-red-100 text-red-700 border border-red-300",
  Canceled:     "bg-red-100 text-red-700 border border-red-300",
};

const STATUS_ICONS: Record<string, string> = {
  Draft:        "📝",
  Confirmed:    "✔️",
  Preparing:    "🟡",
  "To Deliver": "🚚",
  Delivered:    "✅",
  Cancelled:    "❌",
  Canceled:     "❌",
};

const STAT_STATUSES = ["Draft", "Confirmed", "Preparing", "To Deliver", "Delivered", "Cancelled"];

function formatDate(iso: any) {
  if (!iso) return "—";
  let s = iso;
  if (iso.toDate) s = iso.toDate().toISOString().split("T")[0];
  else if (iso instanceof Date) s = iso.toISOString().split("T")[0];
  else if (typeof iso === "string") s = iso.split("T")[0];
  else if (typeof iso === "number") s = new Date(iso).toISOString().split("T")[0];
  if (!s || typeof s !== "string") return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function money(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [poReadiness, setPoReadiness] = useState<Record<string, { total: number; delivered: number }>>({});
  const [weighingOrderIds, setWeighingOrderIds] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<string[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";
      let data: any[] = [];
      let emulatorOk = false;
      if (isLocal) {
        try {
          const res = await fetch("http://localhost:5001/di-peppi/us-central1/getOrders");
          if (res.ok) { data = await res.json(); emulatorOk = true; }
        } catch { /* emulator not running */ }
      }
      if (!emulatorOk) {
        const res = await fetch("https://us-central1-di-peppi.cloudfunctions.net/getOrders");
        data = await res.json();
      }
      setOrders(Array.isArray(data) ? data : []);

      const [productsSnap, itemsSnap, poSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "orderItems")),
        getDocs(collection(db, "purchaseOrders")),
      ]);

      // Weighing
      const weighingProductIds = new Set<string>();
      productsSnap.forEach(d => { if (d.data().requiresWeighing) weighingProductIds.add(d.id); });
      const weighingOrders = new Set<string>();
      itemsSnap.forEach(d => {
        const item = d.data();
        if (item.orderId && weighingProductIds.has(item.productId)) weighingOrders.add(item.orderId);
      });
      setWeighingOrderIds(weighingOrders);

      // PO readiness
      const readiness: Record<string, { total: number; delivered: number }> = {};
      poSnap.forEach(d => {
        const po = d.data();
        if (!po.orderId) return;
        if (!readiness[po.orderId]) readiness[po.orderId] = { total: 0, delivered: 0 };
        readiness[po.orderId].total += 1;
        if (po.status === "Delivered" || po.status === "Paid") readiness[po.orderId].delivered += 1;
      });
      setPoReadiness(readiness);

      // Customer list for autocomplete
      const names = Array.from(new Set(
        (Array.isArray(data) ? data : []).map((o: any) => o.customerName).filter(Boolean)
      )).sort() as string[];
      setCustomers(names);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceStatus = async (e: React.MouseEvent, order: any) => {
    e.stopPropagation();
    const next = STATUS_FLOW[order.status];
    if (!next) return;
    setAdvancing(order.id);
    try {
      await updateDoc(doc(db, "orders", order.id), { status: next });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: next } : o));
    } catch {
      alert("Failed to update status");
    } finally {
      setAdvancing(null);
    }
  };

  const handleDeleteOrder = async (e: React.MouseEvent, orderId: string, orderName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete order ${orderName}? This removes all items and cannot be undone.`)) return;
    try {
      const batch = writeBatch(db);
      const itemsSnap = await getDocs(query(collection(db, "orderItems"), where("orderId", "==", orderId)));
      itemsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, "orders", orderId));
      await batch.commit();
      try {
        await addDoc(collection(db, "auditLog"), { action: "deleted_order", orderId, timestamp: serverTimestamp() });
      } catch { /* non-blocking */ }
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const todayISO = new Date().toISOString().slice(0, 10);

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      (o.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || o.status === filterStatus ||
      (filterStatus === "Cancelled" && o.status === "Canceled");
    const matchType = filterType === "All" || o.customerType === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const filteredRevenue = filtered.reduce((s, o) => s + Number(o.finalTotal || 0), 0);

  // Group by delivery date
  const groups: Record<string, typeof filtered> = {};
  filtered.forEach(o => {
    const key = o.deliveryDate || o.orderDate || "No Date";
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });
  const sortedGroups = Object.entries(groups).sort(([a], [b]) =>
    sortDir === "desc" ? b.localeCompare(a) : a.localeCompare(b)
  );

  const hasActiveFilter = filterStatus !== "All" || filterType !== "All" || search;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Sticky header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold flex-shrink-0" style={{ color: "#B5535A" }}>Orders</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
              {filtered.length}
            </span>
            {filteredRevenue > 0 && (
              <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                {money(filteredRevenue)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Type filter */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
            >
              <option value="All">All Types</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>

            {/* Sort toggle */}
            <button
              onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
              title={sortDir === "desc" ? "Newest first" : "Oldest first"}
              className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown size={15} className="text-gray-500" />
            </button>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search order or client..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowClientDropdown(e.target.value.length > 0); }}
                onFocus={() => { if (search.length > 0) setShowClientDropdown(true); }}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none w-52"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setShowClientDropdown(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
              {showClientDropdown && customers.filter(c => c.toLowerCase().includes(search.toLowerCase())).length > 0 && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {customers.filter(c => c.toLowerCase().includes(search.toLowerCase())).map(c => (
                    <div key={c}
                      className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      onMouseDown={() => { setSearch(c); setShowClientDropdown(false); }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => router.push("/admin/orders/new")}
              className="px-4 py-1.5 text-sm text-white rounded-lg font-medium flex-shrink-0"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              + New Order
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6">

        {/* Clickable stat cards — double as status filter */}
        <div className="py-4 flex gap-2 overflow-x-auto pb-3">
          {/* All pill */}
          <button
            onClick={() => setFilterStatus("All")}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
              filterStatus === "All"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            <span className="font-bold text-sm">{orders.length}</span>
            <span>All</span>
            {filterStatus === "All" && filteredRevenue > 0 && (
              <span className="opacity-70">{money(filteredRevenue)}</span>
            )}
          </button>

          {STAT_STATUSES.map(status => {
            const statusOrders = orders.filter(o =>
              o.status === status || (status === "Cancelled" && o.status === "Canceled")
            );
            const count = statusOrders.length;
            const rev = statusOrders.reduce((s, o) => s + Number(o.finalTotal || 0), 0);
            const active = filterStatus === status;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(active ? "All" : status)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  active
                    ? "bg-gray-900 text-white border-gray-900"
                    : count === 0
                    ? "bg-white text-gray-300 border-gray-100 cursor-default"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
                disabled={count === 0}
              >
                <span>{STATUS_ICONS[status]}</span>
                <span className="font-bold text-sm">{count}</span>
                <span>{status}</span>
                {count > 0 && rev > 0 && (
                  <span className={active ? "opacity-70" : "text-gray-400"}>{money(rev)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Orders list */}
        <div className="pb-8 space-y-1">

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-400 text-sm mb-3">No orders match your filters.</p>
              {hasActiveFilter && (
                <button
                  onClick={() => { setSearch(""); setFilterStatus("All"); setFilterType("All"); }}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {sortedGroups.map(([date, groupOrders]) => (
            <div key={date}>
              {/* Date group header */}
              <div className="flex items-center gap-3 py-2 mt-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {date !== "No Date" ? formatDate(date) : "No Date"}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">
                  {money(groupOrders.reduce((s, o) => s + Number(o.finalTotal || 0), 0))}
                </span>
              </div>

              <div className="space-y-1.5">
                {groupOrders.map(order => {
                  const po = poReadiness[order.id];
                  const isOverdue = order.deliveryDate && order.deliveryDate < todayISO &&
                    !["Delivered", "Cancelled", "Canceled"].includes(order.status);
                  const nextStatus = STATUS_FLOW[order.status];
                  const isAdvancing = advancing === order.id;

                  return (
                    <div
                      key={order.id}
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                      className={`rounded-xl border px-5 py-3.5 flex items-center justify-between cursor-pointer hover:shadow-sm transition-all ${
                        order.status === "Draft"        ? "bg-white border-gray-200" :
                        order.status === "Confirmed"    ? "bg-blue-50 border-blue-200" :
                        order.status === "Preparing"    ? "bg-yellow-50 border-yellow-200" :
                        order.status === "To Deliver"   ? "bg-orange-50 border-orange-200" :
                        order.status === "Delivered"    ? "bg-green-50 border-green-200" :
                        order.status === "Cancelled" || order.status === "Canceled"
                                                        ? "bg-red-50 border-red-200" :
                        "bg-white border-gray-200"
                      }`}
                    >
                      {/* Left: info */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-gray-900 text-sm">{order.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                              {STATUS_ICONS[order.status] || "📝"} {order.status || "Draft"}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                              {order.customerType || "B2C"}
                            </span>
                            {isOverdue && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                ⚠️ Overdue
                              </span>
                            )}
                            {weighingOrderIds.has(order.id) && !["Delivered", "Cancelled", "Canceled"].includes(order.status) && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200">
                                ⚖️ Weigh
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-500 mt-0.5 truncate">{order.customerName || "—"}</p>

                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {order.orderDate && (
                              <span className="text-xs text-gray-400">📅 {formatDate(order.orderDate)}</span>
                            )}
                            {order.deliveryDate && (
                              <span className={`text-xs font-medium ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
                                🚚 {formatDate(order.deliveryDate)}
                              </span>
                            )}
                            {po && po.total > 0 && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                po.delivered === po.total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}>
                                📦 {po.delivered}/{po.total} POs ready
                              </span>
                            )}
                            {order.notes && (
                              <span className="text-xs text-gray-400 truncate max-w-[200px]" title={order.notes}>
                                💬 {order.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: total + actions */}
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        <p className="font-bold text-gray-900 text-base">
                          ${formatPrice(order.finalTotal || 0)}
                        </p>

                        {/* Quick advance */}
                        {nextStatus && (
                          <button
                            onClick={e => handleAdvanceStatus(e, order)}
                            disabled={isAdvancing}
                            title={`Mark as ${nextStatus}`}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40"
                          >
                            {isAdvancing ? (
                              <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <ChevronRight size={13} />
                                {nextStatus}
                              </>
                            )}
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={e => handleDeleteOrder(e, order.id, order.name)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete order"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
