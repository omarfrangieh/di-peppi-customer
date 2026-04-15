"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

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
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://us-central1-di-peppi.cloudfunctions.net/getOrders");
      const data = await res.json();
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
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "orders", orderId), { status: "Delivered" });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Delivered" } : o));
    } catch (err) {
      alert("Failed to update order");
    }
  };

  const toDeliver = orders.filter(o =>
    ["Draft", "Preparing", "To Deliver"].includes(o.status)
  ).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));

  const toWeigh = orders.filter(o =>
    ["Draft", "Preparing", "To Deliver"].includes(o.status) && weighingOrderIds.has(o.id)
  );

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
        className="bg-white rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{order.customerName || order.name}</p>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{order.customerType || "B2C"}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{order.name}</p>
            <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              order.status === "Draft" ? "bg-gray-100 text-gray-600" :
              order.status === "Preparing" ? "bg-yellow-50 text-yellow-700" :
              order.status === "To Deliver" ? "bg-orange-50 text-orange-600" :
              order.status === "Delivered" ? "bg-green-50 text-green-700" :
              order.status === "Cancelled" ? "bg-red-50 text-red-500" :
              "bg-gray-100 text-gray-500"
            }`}>{order.status || "Draft"}</span>
          </div>
          <p className="text-sm font-bold text-gray-900">${Number(order.finalTotal || 0).toFixed(2)}</p>
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
          <div className="flex items-center gap-3">
            <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-lg font-bold" style={{ color: "#1B2A5E" }}>Di Peppi</h1>
              <p className="text-xs" style={{ color: "#B5535A", fontStyle: "italic" }}>Your Gourmet Companion</p>
            </div>
          </div>
          <button onClick={() => router.push("/admin/orders/new")}
            className="px-4 py-2 text-sm text-white rounded-xl font-bold"
            style={{ backgroundColor: "#1B2A5E" }}>
            + New Order
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Nav */}
        <div className="grid grid-cols-5 gap-3">
          <NavButton emoji="📋" label="Orders" path="/admin/orders" />
          <NavButton emoji="🧾" label="Invoices" path="/invoices" />
          <NavButton emoji="⚙️" label="Products" path="/admin/products" />
          <NavButton emoji="👥" label="Customers" path="/admin/customers" />
          <NavButton emoji="🏭" label="Suppliers" path="/admin/suppliers" />
        </div>

        {/* Dashboard columns */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* To Deliver */}
            <div className="bg-gray-100 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">🚚 To Deliver</h2>
                <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-600 font-medium">{toDeliver.length}</span>
              </div>
              {toDeliver.length === 0 && <p className="text-xs text-gray-400 text-center py-4">All clear! 🎉</p>}
              {toDeliver.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

            {/* Orders To Weigh */}
            <div className="bg-amber-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">⚖️ To Weigh</h2>
                <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-600 font-medium">{toWeigh.length}</span>
              </div>
              {toWeigh.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No weighing needed</p>}
              {toWeigh.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

            {/* Delivered & Unpaid */}
            <div className="bg-green-50 rounded-2xl p-4 space-y-3">
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
