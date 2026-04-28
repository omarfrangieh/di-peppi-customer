"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { formatPrice, formatQty } from "@/lib/formatters";

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function trendLabel(current: number, previous: number): { text: string; up: boolean | null } {
  if (previous === 0 && current === 0) return { text: "—", up: null };
  if (previous === 0) return { text: "New this week", up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "Same as last week", up: null };
  return { text: `${pct > 0 ? "▲" : "▼"}${Math.abs(pct)}% vs last week`, up: pct > 0 };
}

export default function Dashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [weighingOrderIds, setWeighingOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [invoiceStats, setInvoiceStats] = useState({ outstanding: 0, overdueCount: 0 });
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
        if (item.orderId && weighingProductIds.has(item.productId)) weighingOrders.add(item.orderId);
      });
      setWeighingOrderIds(weighingOrders);

      // Expiring batches (within 90 days)
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

      // Low-stock — sort by urgency tier then by % of min remaining
      const lowStock: any[] = [];
      productsSnap.forEach(d => {
        const p = d.data();
        const cur = Number(p.currentStock || 0);
        const min = Number(p.minStock || 0);
        if (p.active !== false && min > 0 && cur <= min) {
          const pct = cur <= 0 ? 0 : cur / min;
          const tier = cur <= 0 ? 0 : pct <= 0.25 ? 1 : 2; // 0=out, 1=critical, 2=low
          lowStock.push({ id: d.id, name: p.name, currentStock: cur, minStock: min, unit: p.unit || "", tier, pct });
        }
      });
      lowStock.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : a.pct - b.pct);
      setLowStockProducts(lowStock);

      // Invoice stats
      const invoicesSnap = await getDocs(collection(db, "invoices"));
      let outstanding = 0;
      let overdueCount = 0;
      invoicesSnap.forEach(d => {
        const inv = d.data();
        if (inv.status === "issued" || inv.status === "overdue") {
          outstanding += Number(inv.finalTotal || 0);
          if (inv.status === "overdue" || (inv.dueDate && inv.dueDate < todayISO)) overdueCount += 1;
        }
      });
      setInvoiceStats({ outstanding, overdueCount });
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "orders", orderId), { status: "Delivered" });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Delivered" } : o));
    } catch {
      alert("Failed to update order");
    }
  };

  const preparing = orders
    .filter(o => ["Draft", "Confirmed", "Preparing"].includes(o.status))
    .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  const toDeliver = orders
    .filter(o => o.status === "To Deliver")
    .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  const deliveredUnpaid = orders.filter(o => o.status === "Delivered");
  const activeOrders = orders.filter(o => !["Delivered", "Cancelled", "Canceled"].includes(o.status));
  const deliveredOrders = orders.filter(o => o.status === "Delivered");

  // Week-over-week trends
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const twISO = thisWeekStart.toISOString();
  const lwISO = lastWeekStart.toISOString();

  const activeThisWeek = orders.filter(o => (o.createdAt || "") >= twISO).length;
  const activeLastWeek = orders.filter(o => (o.createdAt || "") >= lwISO && (o.createdAt || "") < twISO).length;
  const revTotal = deliveredOrders.reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revThisWeek = deliveredOrders.filter(o => (o.updatedAt || o.createdAt || "") >= twISO)
    .reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revLastWeek = deliveredOrders
    .filter(o => { const d = o.updatedAt || o.createdAt || ""; return d >= lwISO && d < twISO; })
    .reduce((s, o) => s + Number(o.finalTotal || 0), 0);

  // Today's snapshot
  const packToday = orders.filter(o => ["Draft", "Confirmed", "Preparing"].includes(o.status) && o.deliveryDate === todayISO).length;
  const deliverToday = orders.filter(o => o.status === "To Deliver" && o.deliveryDate === todayISO).length;
  const weighToday = orders.filter(o =>
    weighingOrderIds.has(o.id) &&
    !["Delivered", "Cancelled", "Canceled"].includes(o.status) &&
    o.deliveryDate === todayISO
  ).length;

  const orderTrend = trendLabel(activeThisWeek, activeLastWeek);
  const revTrend = trendLabel(revThisWeek, revLastWeek);

  const KPICard = ({
    label, value, sub, color, bg, trend, href,
  }: {
    label: string; value: string | number; sub: string; color: string; bg: string;
    trend?: { text: string; up: boolean | null }; href?: string;
  }) => (
    <div
      onClick={() => href && router.push(href)}
      className={`rounded-xl border px-4 py-3 ${bg} ${href ? "cursor-pointer hover:shadow-md transition-all" : ""}`}
    >
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      {trend && trend.text !== "—" && (
        <p className={`text-xs font-medium mt-1.5 ${
          trend.up === true ? "text-green-600" : trend.up === false ? "text-red-500" : "text-gray-400"
        }`}>
          {trend.text}
        </p>
      )}
    </div>
  );

  const OrderCard = ({ order }: { order: any }) => {
    const isOverdue = order.deliveryDate && order.deliveryDate < todayISO;
    return (
      <div
        onClick={() => router.push(`/admin/orders/${order.id}`)}
        className={`rounded-lg border px-4 py-3 cursor-pointer hover:shadow-sm transition-all ${
          order.status === "Draft" ? "bg-gray-50 border-gray-300" :
          order.status === "Preparing" ? "bg-yellow-50 border-yellow-200" :
          order.status === "To Deliver" ? "bg-orange-50 border-orange-200" :
          order.status === "Delivered" ? "bg-green-50 border-green-200" :
          (order.status === "Cancelled" || order.status === "Canceled") ? "bg-red-50 border-red-200" :
          "bg-white border-gray-200"
        }`}
      >
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
        {["Draft", "Confirmed", "Preparing", "To Deliver"].includes(order.status) && (
          <button
            onClick={(e) => markDelivered(order.id, e)}
            className="mt-2 w-full text-xs py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 font-medium transition-all"
          >
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
          <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Dashboard</h1>
          <button
            onClick={() => router.push("/admin/orders/new")}
            className="px-4 py-2 text-sm text-white rounded-xl font-bold"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            + New Order
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Today's Snapshot Bar */}
        {!loading && (packToday > 0 || deliverToday > 0 || weighToday > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-6 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</span>
            {packToday > 0 && (
              <button
                onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-blue-600 transition-colors"
              >
                <span>📦</span>
                <span className="font-semibold text-gray-900">{packToday}</span>
                <span className="text-gray-500">order{packToday !== 1 ? "s" : ""} to pack</span>
              </button>
            )}
            {deliverToday > 0 && (
              <button
                onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-orange-600 transition-colors"
              >
                <span>🚚</span>
                <span className="font-semibold text-gray-900">{deliverToday}</span>
                <span className="text-gray-500">{deliverToday !== 1 ? "deliveries" : "delivery"} scheduled</span>
              </button>
            )}
            {weighToday > 0 && (
              <button
                onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-red-600 transition-colors"
              >
                <span>⚖️</span>
                <span className="font-semibold text-gray-900">{weighToday}</span>
                <span className="text-gray-500">{weighToday !== 1 ? "orders" : "order"} need weighing</span>
              </button>
            )}
          </div>
        )}

        {/* KPI Bar */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              label="Active Orders"
              value={activeOrders.length}
              sub={`${toDeliver.length} ready to deliver`}
              color="text-blue-700"
              bg="bg-blue-50 border-blue-200"
              trend={orderTrend}
              href="/admin/orders"
            />
            <KPICard
              label="Revenue (Delivered)"
              value={"$" + revTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              sub={`${deliveredOrders.length} delivered orders`}
              color="text-green-700"
              bg="bg-green-50 border-green-200"
              trend={revTrend}
            />
            <KPICard
              label="Outstanding Invoices"
              value={"$" + invoiceStats.outstanding.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              sub={invoiceStats.overdueCount > 0 ? `${invoiceStats.overdueCount} overdue` : "All on time"}
              color={invoiceStats.overdueCount > 0 ? "text-red-700" : "text-gray-700"}
              bg={invoiceStats.overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}
              href="/invoices"
            />
            <KPICard
              label="⚖️ Need Weighing"
              value={orders.filter(o => weighingOrderIds.has(o.id) && !["Delivered", "Cancelled", "Canceled"].includes(o.status)).length}
              sub="active orders with weigh items"
              color="text-orange-700"
              bg="bg-orange-50 border-orange-200"
              href="/admin/orders"
            />
          </div>
        )}

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

        {/* Low Stock Alert — sorted by urgency, with Create PO button */}
        {lowStockProducts.length > 0 && (
          <div className="bg-white rounded-2xl border border-yellow-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900 text-sm">📦 Low Stock</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">
                  {lowStockProducts.length} product{lowStockProducts.length !== 1 ? "s" : ""}
                </span>
                {lowStockProducts.some(p => p.tier === 0) && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                    {lowStockProducts.filter(p => p.tier === 0).length} out of stock
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/admin/purchase-orders")}
                className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                View POs →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {lowStockProducts.slice(0, 12).map(p => (
                <div key={p.id} className={`rounded-xl border px-3 py-2 text-xs flex flex-col gap-1 ${
                  p.tier === 0 ? "bg-red-50 border-red-300" :
                  p.tier === 1 ? "bg-red-50 border-red-200" :
                  "bg-yellow-50 border-yellow-200"
                }`}>
                  <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className={`font-bold ${p.tier === 0 ? "text-red-600" : p.tier === 1 ? "text-red-500" : "text-yellow-700"}`}>
                    {p.tier === 0 ? "❌ Out" : `${formatQty(p.currentStock)} ${p.unit}`}
                  </p>
                  <p className="text-gray-400">Min: {formatQty(p.minStock)}</p>
                  <button
                    onClick={() => router.push("/admin/purchase-orders")}
                    className="mt-0.5 text-xs py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium text-center"
                  >
                    + Create PO
                  </button>
                </div>
              ))}
              {lowStockProducts.length > 12 && (
                <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs flex items-center justify-center text-gray-400">
                  +{lowStockProducts.length - 12} more
                </div>
              )}
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
            <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">📝 Draft & Preparing</h2>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600 font-medium">{preparing.length}</span>
              </div>
              {preparing.length === 0 && <p className="text-xs text-gray-400 text-center py-4">All clear! 🎉</p>}
              {preparing.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

            <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">🚚 To Deliver</h2>
                <span className="text-xs bg-orange-100 px-2 py-0.5 rounded-full text-orange-600 font-medium">{toDeliver.length}</span>
              </div>
              {toDeliver.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nothing to deliver</p>}
              {toDeliver.map(o => <OrderCard key={o.id} order={o} />)}
            </div>

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
