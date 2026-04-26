"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { formatPrice, formatQty } from "@/lib/formatters";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Confirmed: "bg-blue-50 text-blue-600",
  Preparing: "bg-yellow-50 text-yellow-700",
  "To Deliver": "bg-orange-50 text-orange-600",
  Delivered: "bg-green-50 text-green-700",
  Cancelled: "bg-red-50 text-red-500",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [weighingOrderIds, setWeighingOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const todayISO = new Date().toISOString().slice(0, 10);

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

      // Find orders that have items with requiresWeighing products
      const [productsSnap, itemsSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "orderItems")),
      ]);

      const weighingProductIds = new Set<string>();
      productsSnap.forEach((d: any) => {
        if (d.data().requiresWeighing) weighingProductIds.add(d.id);
      });

      const weighingOrders = new Set<string>();
      itemsSnap.forEach((d: any) => {
        const item = d.data();
        if (item.orderId && weighingProductIds.has(item.productId)) {
          weighingOrders.add(item.orderId);
        }
      });
      setWeighingOrderIds(weighingOrders);

      // Load expiring batches (within 90 days)
      const movementsSnap = await getDocs(collection(db, "stockMovements"));
      const now = new Date();
      const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const batches: any[] = [];
      const productNames: Record<string, string> = {};
      productsSnap.forEach((d: any) => { productNames[d.id] = d.data().name || "Unknown"; });
      movementsSnap.forEach((d: any) => {
        const m = d.data();
        if (!m.expiryDate) return;
        const expiry = new Date(m.expiryDate);
        if (expiry <= in90Days && m.movementType === "In" && Number(m.quantity || 0) > 0) {
          batches.push({
            id: d.id,
            productId: m.productId,
            productName: productNames[m.productId] || m.productName || "Unknown",
            quantity: m.quantity,
            expiryDate: m.expiryDate,
            expired: expiry < now,
            critical: expiry < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
      });
      batches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      setExpiringBatches(batches);
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "orders", orderId), { status: "Delivered" });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Delivered" } : o));
    } catch (err) {
      alert("Failed to update order");
    }
  };

  const preparing = orders.filter(o =>
    ["Draft", "Preparing"].includes(o.status)
  ).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));

  const toDeliver = orders.filter(o =>
    o.status === "To Deliver"
  ).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));

  const deliveredUnpaid = orders.filter(o => o.status === "Delivered");

  const NavButton = ({ label, path, emoji }: { label: string; path: string; emoji: string }) => (
    <button onClick={() => router.push(path)}
      className="flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-xs font-medium text-gray-700" style={label === "Orders" ? {color: "#B5535A", borderColor: "#B5535A"} : {}}>
      <span className="text-lg">{emoji}</span>
      {label}
    </button>
  );

  const OrderCard = ({ order }: { order: any }) => {
    const isOverdue = order.deliveryDate && order.deliveryDate < todayISO;
    return (
      <div onClick={() => router.push(`/admin/orders/${order.id}`)}
        className={`rounded-lg border px-4 py-3 cursor-pointer hover:shadow-sm transition-all ${
        order.status === "Draft" ? "bg-gray-50 border-gray-300" :
        order.status === "Preparing" ? "bg-yellow-50 border-yellow-200" :
        order.status === "To Deliver" ? "bg-orange-50 border-orange-200" :
        order.status === "Delivered" ? "bg-green-50 border-green-200" :
        order.status === "Cancelled" || order.status === "Canceled" ? "bg-red-50 border-red-200" :
        "bg-white border-gray-200"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{order.customerName || order.name}</p>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{order.customerType || "B2C"}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{order.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                order.status === "Draft" ? "bg-gray-100 text-gray-600" :
                order.status === "Preparing" ? "bg-yellow-50 text-yellow-700" :
                order.status === "To Deliver" ? "bg-orange-50 text-orange-600" :
                order.status === "Delivered" ? "bg-green-50 text-green-700" :
                order.status === "Cancelled" ? "bg-red-50 text-red-500" :
                "bg-gray-100 text-gray-500"
              }`}>{order.status || "Draft"}</span>
              {weighingOrderIds.has(order.id) && ["Draft", "Preparing"].includes(order.status) && (
                <span className="inline-block text-xs px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-600 border border-red-300">
                  ⚖️ Weigh!
                </span>
              )}
            </div>
          </div>
          <p className="text-sm font-bold text-gray-900">${formatPrice(order.finalTotal || 0)}</p>
        </div>
        {order.deliveryDate && (
          <p className={`text-xs mt-1 font-medium ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
            {isOverdue ? "⚠️ " : ""}Delivery: {formatDate(order.deliveryDate)}
          </p>
        )}
        {["Draft", "Preparing", "To Deliver"].includes(order.status) && (
          <button
            onClick={(e) => markDelivered(order.id, e)}
            className="mt-2 w-full text-xs py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 font-medium transition-all">
            ✓ Mark Delivered
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Dashboard</h1>
          <button onClick={() => router.push("/admin/orders/new")}
            className="px-4 py-2 text-sm text-white rounded-xl font-bold"
            style={{ backgroundColor: "#1B2A5E" }}>
            + New Order
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">


        {/* Expiry Alerts */}
        {expiringBatches.length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-gray-900 text-sm">📅 Expiry Alerts</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                expiringBatches.some(b => b.expired || b.critical) ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
              }`}>{expiringBatches.length} batch{expiringBatches.length !== 1 ? "es" : ""}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {expiringBatches.map(batch => (
                <div key={batch.id} className={`rounded-xl border px-3 py-2 text-xs ${
                  batch.expired ? "bg-red-50 border-red-300" :
                  batch.critical ? "bg-red-50 border-red-200" :
                  "bg-orange-50 border-orange-200"
                }`}>
                  <p className="font-semibold text-gray-900 truncate">{batch.productName}</p>
                  <p className="text-gray-500 mt-0.5">Qty: <span className="font-medium text-gray-700">{formatQty(batch.quantity)}</span></p>
                  <p className={`font-semibold mt-0.5 ${batch.expired ? "text-red-700" : batch.critical ? "text-red-500" : "text-orange-600"}`}>
                    {batch.expired ? "❌ " : batch.critical ? "⚠️ " : "🟡 "}
                    {new Date(batch.expiryDate).toLocaleDateString("en-GB")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dashboard columns */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Draft & Preparing */}
            <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">📝 Draft & Preparing</h2>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600 font-medium">{preparing.length}</span>
              </div>
              {preparing.length === 0 && <p className="text-xs text-gray-400 text-center py-4">All clear! 🎉</p>}
              {preparing.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

            {/* To Deliver */}
            <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">🚚 To Deliver</h2>
                <span className="text-xs bg-orange-100 px-2 py-0.5 rounded-full text-orange-600 font-medium">{toDeliver.length}</span>
              </div>
              {toDeliver.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nothing to deliver</p>}
              {toDeliver.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

            {/* Delivered & Unpaid */}
            <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">💰 Delivered & Unpaid</h2>
                <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-600 font-medium">{deliveredUnpaid.length}</span>
              </div>
              {deliveredUnpaid.length === 0 && <p className="text-xs text-gray-400 text-center py-4">All paid! ✅</p>}
              {deliveredUnpaid.map(o => <OrderCard key={o.id} order={o} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
