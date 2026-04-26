"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, doc, deleteDoc, writeBatch, serverTimestamp, where, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { X, Trash2 } from "lucide-react";

const DELIVERY_STATUSES = ["All", "Draft", "Confirmed", "Preparing", "To Deliver", "Delivered", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-200 text-gray-700 font-semibold",
  Preparing: "bg-yellow-100 text-yellow-800 font-semibold border border-yellow-300",
  "To Deliver": "bg-orange-100 text-orange-700 font-semibold border border-orange-300",
  Delivered: "bg-green-100 text-green-800 font-semibold border border-green-300",
  Cancelled: "bg-red-100 text-red-700 font-semibold border border-red-300",
  Canceled: "bg-red-100 text-red-700 font-semibold border border-red-300",
};

const STATUS_ICONS: Record<string, string> = {
  Draft: "📝",
  Preparing: "🟡",
  "To Deliver": "🚚",
  Delivered: "✅",
  Cancelled: "❌",
  Canceled: "❌",
};

function formatDate(iso: any) {
  if (!iso) return "—";

  let dateStr = iso;

  // Handle Firestore timestamps
  if (iso.toDate && typeof iso.toDate === "function") {
    dateStr = iso.toDate().toISOString().split("T")[0];
  }
  // Handle Date objects
  else if (iso instanceof Date) {
    dateStr = iso.toISOString().split("T")[0];
  }
  // Handle ISO strings
  else if (typeof iso === "string") {
    dateStr = iso.split("T")[0];
  }
  // Handle numeric timestamps
  else if (typeof iso === "number") {
    dateStr = new Date(iso).toISOString().split("T")[0];
  }

  if (!dateStr || typeof dateStr !== "string") return "—";

  const parts = dateStr.split("-");
  if (parts.length !== 3) return "—";

  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [poReadiness, setPoReadiness] = useState<Record<string, { total: number; delivered: number }>>({});
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [customers, setCustomers] = useState<string[]>([]);

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
        } catch {
          // emulator not running — fall through to production
        }
      }
      if (!emulatorOk) {
        const res = await fetch("https://us-central1-di-peppi.cloudfunctions.net/getOrders");
        data = await res.json();
      }
      setOrders(Array.isArray(data) ? data : []);

      // Load PO readiness
      const poSnap = await getDocs(collection(db, "purchaseOrders"));
      const readiness: Record<string, { total: number; delivered: number }> = {};
      poSnap.forEach(d => {
        const po = d.data();
        if (!po.orderId) return;
        if (!readiness[po.orderId]) readiness[po.orderId] = { total: 0, delivered: 0 };
        readiness[po.orderId].total += 1;
        if (po.status === "Delivered" || po.status === "Paid") readiness[po.orderId].delivered += 1;
      });
      setPoReadiness(readiness);

      // Load unique customer names
      const customerNames = Array.from(new Set(
        (Array.isArray(data) ? data : []).map((o: any) => o.customerName).filter(Boolean)
      )).sort() as string[];
      setCustomers(customerNames);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderName: string) => {
    if (!confirm(`Are you sure you want to delete order ${orderName}? This will delete the entire order and all items. This action cannot be undone.`)) {
      return;
    }

    try {
      const batch = writeBatch(db);

      // Delete all order items
      const itemsSnap = await getDocs(query(collection(db, "orderItems"), where("orderId", "==", orderId)));
      itemsSnap.docs.forEach(d => batch.delete(d.ref));

      // Delete the order
      batch.delete(doc(db, "orders", orderId));

      await batch.commit();

      // Audit log separately — never block deletion if this fails
      try {
        await addDoc(collection(db, "auditLog"), {
          action: "deleted_order",
          orderId,
          timestamp: serverTimestamp(),
        });
      } catch (auditErr) {
        console.warn("Audit log failed (non-blocking):", auditErr);
      }

      await load();
    } catch (error: any) {
      console.error("Delete order error:", error);
      alert(`Failed to delete order: ${error.message || JSON.stringify(error)}`);
    }
  };

  const filtered = orders.filter(o => {
    const matchSearch = (o.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName || "").toLowerCase().includes(search.toLowerCase());
    const matchClient = !clientSearch || (o.customerName || "").toLowerCase().includes(clientSearch.toLowerCase());
    const matchStatus = filterStatus === "All" || o.status === filterStatus || o.deliveryStatus === filterStatus;
    const matchType = filterType === "All" || o.customerType === filterType;
    return matchSearch && matchStatus && matchType && matchClient;
  });

  const todayISO = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Orders</h1>
          <span className="text-xs text-gray-400">{filtered.length} orders</span>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none">
            <option value="All">All Types</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none">
            {DELIVERY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <div className="relative">
            <input
              type="text"
              placeholder="Search order or client..."
              value={search}
              onChange={e => { setSearch(e.target.value); setClientSearch(""); setShowClientDropdown(e.target.value.length > 0); }}
              onFocus={e => { if (e.target.value.length > 0) setShowClientDropdown(true); }}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none w-56"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setShowClientDropdown(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                type="button"
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
            {showClientDropdown && customers.filter(c => c.toLowerCase().includes(search.toLowerCase())).length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {customers.filter(c => c.toLowerCase().includes(search.toLowerCase())).map(c => (
                  <div key={c}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                    onMouseDown={() => { setClientSearch(c); setSearch(c); setShowClientDropdown(false); }}>
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => router.push("/admin/orders/new")}
            className="px-4 py-1.5 text-sm text-white rounded-lg font-medium"
            style={{ backgroundColor: "#1B2A5E" }}>
            + New Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-4 gap-3">
        {[
          { label: "Draft", value: orders.filter(o => o.status === "Draft").length, color: "text-gray-500" },
          { label: "Preparing", value: orders.filter(o => o.status === "Preparing").length, color: "text-yellow-600" },
          { label: "To Deliver", value: orders.filter(o => o.status === "To Deliver").length, color: "text-orange-600" },
          { label: "Delivered", value: orders.filter(o => o.status === "Delivered").length, color: "text-green-600" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Orders List */}
      <div className="max-w-6xl mx-auto px-6 pb-6 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">No orders found.</div>
        )}
        {(() => {
          const groups: Record<string, typeof filtered> = {};
          filtered.forEach(order => {
            const key = order.deliveryDate || order.orderDate || "No Date";
            if (!groups[key]) groups[key] = [];
            groups[key].push(order);
          });
          return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([date, groupOrders]) => (
            <div key={date}>
              <div className="flex items-center gap-3 py-2">
                <span className="text-xs font-bold text-gray-700 tracking-wider">
                  {date !== "No Date" ? date.split("-").reverse().join("-") : "No Date"}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              {groupOrders.map(order => {
          const po = poReadiness[order.id];
          const isOverdue = order.deliveryDate && order.deliveryDate < todayISO && order.status !== "Delivered" && order.status !== "Cancelled";
          return (
            <div key={order.id}
              onClick={() => router.push(`/admin/orders/${order.id}`)}
              className={`rounded-xl border px-5 py-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-all ${
                order.status === "Draft" ? "bg-gray-50 border-gray-300" :
                order.status === "Preparing" ? "bg-yellow-50 border-yellow-200" :
                order.status === "To Deliver" ? "bg-orange-50 border-orange-200" :
                order.status === "Delivered" ? "bg-green-50 border-green-200" :
                order.status === "Cancelled" || order.status === "Canceled" ? "bg-red-50 border-red-200" :
                "bg-white border-gray-200"
              }`}>
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{order.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-200 text-gray-700 font-semibold"}`}>
                      {STATUS_ICONS[order.status] || "📝"} {order.status || "Draft"}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {order.customerType || "B2C"}
                    </span>
                    {isOverdue && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                        ⚠️ Overdue
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{order.customerName || "—"}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {order.orderDate && <span className="text-xs text-gray-400">Order: {formatDate(order.orderDate)}</span>}
                    {order.deliveryDate && (
                      <span className={`text-xs font-medium ${isOverdue ? "text-red-500" : "text-gray-500"}`}>
                        Delivery: {formatDate(order.deliveryDate)}
                      </span>
                    )}
                    {po && po.total > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        po.delivered === po.total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        📦 POs {po.delivered}/{po.total} ready
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                <p className="font-semibold text-gray-900">${formatPrice(order.finalTotal || 0)}</p>
                {order.notes && <p className="text-xs text-gray-400 max-w-[200px] truncate">{order.notes}</p>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteOrder(order.id, order.name);
                  }}
                  className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1 transition-colors"
                  title="Delete order"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          );
            })}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
