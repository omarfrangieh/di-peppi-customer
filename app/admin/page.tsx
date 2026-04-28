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

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MiniBarChart({ days }: { days: { label: string; value: number }[] }) {
  const max = Math.max(...days.map(d => d.value), 1);
  const BAR_W = 10;
  const GAP = 3;
  const H = 32;
  const totalW = days.length * (BAR_W + GAP) - GAP;
  return (
    <div className="mt-2">
      <svg width={totalW} height={H}>
        {days.map((d, i) => {
          const h = Math.max(Math.round((d.value / max) * H), 2);
          return (
            <rect key={i} x={i * (BAR_W + GAP)} y={H - h} width={BAR_W} height={h}
              rx={2} fill={d.value > 0 ? "#4ade80" : "#e5e7eb"} />
          );
        })}
      </svg>
      <div className="flex mt-0.5" style={{ gap: GAP }}>
        {days.map((d, i) => (
          <span key={i} className="text-gray-300 text-center"
            style={{ width: BAR_W, fontSize: 7, display: "inline-block" }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Column drop targets and their canonical status on drop
const PIPELINE_COLS = [
  { key: "preparing", label: "📝 Draft & Preparing", dropStatus: "Preparing", badge: "bg-gray-100 text-gray-600" },
  { key: "toDeliver", label: "🚚 To Deliver",        dropStatus: "To Deliver", badge: "bg-orange-100 text-orange-600" },
  { key: "delivered", label: "✅ Delivered",          dropStatus: "Delivered",  badge: "bg-green-100 text-green-700" },
] as const;

export default function Dashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [weighingOrderIds, setWeighingOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [invoiceStats, setInvoiceStats] = useState({ outstanding: 0, overdueCount: 0 });
  const [recentActivity, setRecentActivity] = useState<{ id: string; type: string; text: string; sub: string; at: string }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; total: number; count: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; orders: number }[]>([]);
  const [revDays, setRevDays] = useState<{ label: string; value: number }[]>([]);

  // Drag & drop
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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
      const orderArr: any[] = Array.isArray(data) ? data : [];
      setOrders(orderArr);

      const [productsSnap, itemsSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "orderItems")),
      ]);

      const weighingProductIds = new Set<string>();
      const productNames: Record<string, string> = {};
      productsSnap.forEach((d: any) => {
        const p = d.data();
        productNames[d.id] = p.name || "Unknown";
        if (p.requiresWeighing) weighingProductIds.add(d.id);
      });

      const weighingOrders = new Set<string>();
      const productQty: Record<string, { qty: number; orderIds: Set<string> }> = {};
      itemsSnap.forEach((d: any) => {
        const item = d.data();
        if (item.orderId && weighingProductIds.has(item.productId)) weighingOrders.add(item.orderId);
        if (item.productId) {
          if (!productQty[item.productId]) productQty[item.productId] = { qty: 0, orderIds: new Set() };
          productQty[item.productId].qty += Number(item.quantity || 0);
          if (item.orderId) productQty[item.productId].orderIds.add(item.orderId);
        }
      });
      setWeighingOrderIds(weighingOrders);
      setTopProducts(
        Object.entries(productQty)
          .map(([id, v]) => ({ name: productNames[id] || id, qty: v.qty, orders: v.orderIds.size }))
          .sort((a, b) => b.orders - a.orders)
          .slice(0, 5)
      );

      // Expiring batches
      const movementsSnap = await getDocs(collection(db, "stockMovements"));
      const now = new Date();
      const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const batches: any[] = [];
      movementsSnap.forEach((d: any) => {
        const m = d.data();
        if (!m.expiryDate) return;
        const expiry = new Date(m.expiryDate);
        if (expiry <= in90Days && m.movementType === "In" && Number(m.quantity || 0) > 0) {
          batches.push({
            id: d.id,
            productName: productNames[m.productId] || m.productName || "Unknown",
            quantity: m.quantity, expiryDate: m.expiryDate,
            expired: expiry < now,
            critical: expiry < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
      });
      batches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      setExpiringBatches(batches);

      // Low-stock — urgency tier
      const lowStock: any[] = [];
      productsSnap.forEach(d => {
        const p = d.data();
        const cur = Math.round(Number(p.currentStock || 0) * 1000) / 1000;
        const min = Number(p.minStock || 0);
        if (p.active !== false && min > 0 && cur <= min) {
          const pct = cur <= 0 ? 0 : cur / min;
          const tier = cur <= 0 ? 0 : pct <= 0.25 ? 1 : 2;
          lowStock.push({ id: d.id, name: p.name, currentStock: cur, minStock: min, unit: p.unit || "", tier, pct });
        }
      });
      lowStock.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : a.pct - b.pct);
      setLowStockProducts(lowStock);

      // Invoices
      const invoicesSnap = await getDocs(collection(db, "invoices"));
      let outstanding = 0, overdueCount = 0;
      const invoiceActivity: { id: string; type: string; text: string; sub: string; at: string }[] = [];
      invoicesSnap.forEach(d => {
        const inv = d.data();
        if (inv.status === "issued" || inv.status === "overdue") {
          outstanding += Number(inv.finalTotal || 0);
          if (inv.status === "overdue" || (inv.dueDate && inv.dueDate < todayISO)) overdueCount += 1;
        }
        if (inv.status === "paid" && inv.paidAt) {
          invoiceActivity.push({
            id: d.id, type: "invoice",
            text: `Invoice ${inv.invoiceNumber || d.id} paid`,
            sub: inv.customerName || "",
            at: inv.paidAt,
          });
        }
      });
      setInvoiceStats({ outstanding, overdueCount });

      // Recent activity feed
      const orderActivity = orderArr
        .filter(o => o.updatedAt || o.createdAt)
        .map(o => ({
          id: o.id, type: "order",
          text: `${o.name || "Order"} → ${o.status}`,
          sub: o.customerName || "",
          at: o.updatedAt || o.createdAt,
        }));
      setRecentActivity(
        [...orderActivity, ...invoiceActivity]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 10)
      );

      // Top customers (all time from loaded orders)
      const custMap: Record<string, { total: number; count: number }> = {};
      orderArr.forEach(o => {
        const name = o.customerName || "Unknown";
        if (!custMap[name]) custMap[name] = { total: 0, count: 0 };
        custMap[name].total += Number(o.finalTotal || 0);
        custMap[name].count += 1;
      });
      setTopCustomers(
        Object.entries(custMap)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
      );

      // 7-day revenue chart from delivered orders
      const deliveredArr = orderArr.filter(o => o.status === "Delivered");
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 6 + i);
        const iso = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" })[0]; // M T W T F S S
        const value = deliveredArr
          .filter(o => (o.deliveryDate || o.updatedAt || "").slice(0, 10) === iso)
          .reduce((s: number, o: any) => s + Number(o.finalTotal || 0), 0);
        return { label, value };
      });
      setRevDays(days);

    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (colKey: string, dropStatus: string) => {
    if (!dragOrderId) return;
    const order = orders.find(o => o.id === dragOrderId);
    if (!order || order.status === dropStatus) { setDragOrderId(null); setDragOverCol(null); return; }
    try {
      await updateDoc(doc(db, "orders", dragOrderId), { status: dropStatus, updatedAt: new Date().toISOString() });
      setOrders(prev => prev.map(o => o.id === dragOrderId ? { ...o, status: dropStatus } : o));
    } catch {
      alert("Failed to update status");
    } finally {
      setDragOrderId(null);
      setDragOverCol(null);
    }
  };

  const markDelivered = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "orders", orderId), { status: "Delivered", updatedAt: new Date().toISOString() });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Delivered" } : o));
    } catch {
      alert("Failed to update order");
    }
  };

  // Column order groupings
  const colOrders = {
    preparing: orders.filter(o => ["Draft", "Confirmed", "Preparing"].includes(o.status))
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "")),
    toDeliver: orders.filter(o => o.status === "To Deliver")
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "")),
    delivered: orders.filter(o => o.status === "Delivered"),
  } as Record<string, any[]>;

  const activeOrders = orders.filter(o => !["Delivered", "Cancelled", "Canceled"].includes(o.status));
  const deliveredOrders = orders.filter(o => o.status === "Delivered");
  const toDeliver = colOrders.toDeliver;

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
    weighingOrderIds.has(o.id) && !["Delivered", "Cancelled", "Canceled"].includes(o.status) && o.deliveryDate === todayISO
  ).length;

  const orderTrend = trendLabel(activeThisWeek, activeLastWeek);
  const revTrend = trendLabel(revThisWeek, revLastWeek);

  const KPICard = ({
    label, value, sub, color, bg, trend, href, chart,
  }: {
    label: string; value: string | number; sub: string; color: string; bg: string;
    trend?: { text: string; up: boolean | null }; href?: string;
    chart?: React.ReactNode;
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
        }`}>{trend.text}</p>
      )}
      {chart}
    </div>
  );

  const OrderCard = ({ order }: { order: any }) => {
    const isOverdue = order.deliveryDate && order.deliveryDate < todayISO;
    const isDragging = dragOrderId === order.id;
    return (
      <div
        draggable
        onDragStart={() => setDragOrderId(order.id)}
        onDragEnd={() => { setDragOrderId(null); setDragOverCol(null); }}
        onClick={() => router.push(`/admin/orders/${order.id}`)}
        className={`rounded-lg border px-4 py-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none ${isDragging ? "opacity-40" : ""} ${
          order.status === "Draft"      ? "bg-gray-50 border-gray-300" :
          order.status === "Preparing"  ? "bg-yellow-50 border-yellow-200" :
          order.status === "To Deliver" ? "bg-orange-50 border-orange-200" :
          order.status === "Delivered"  ? "bg-green-50 border-green-200" :
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
                order.status === "Draft"      ? "bg-gray-100 text-gray-600" :
                order.status === "Preparing"  ? "bg-yellow-50 text-yellow-700" :
                order.status === "To Deliver" ? "bg-orange-50 text-orange-600" :
                order.status === "Delivered"  ? "bg-green-50 text-green-700" :
                order.status === "Cancelled"  ? "bg-red-50 text-red-500" :
                "bg-gray-100 text-gray-500"
              }`}>{order.status || "Draft"}</span>
              {weighingOrderIds.has(order.id) && ["Draft", "Confirmed", "Preparing"].includes(order.status) && (
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

        {/* Today's Snapshot */}
        {!loading && (packToday > 0 || deliverToday > 0 || weighToday > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-6 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</span>
            {packToday > 0 && (
              <button onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-blue-600 transition-colors">
                <span>📦</span>
                <span className="font-semibold text-gray-900">{packToday}</span>
                <span className="text-gray-500">order{packToday !== 1 ? "s" : ""} to pack</span>
              </button>
            )}
            {deliverToday > 0 && (
              <button onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-orange-600 transition-colors">
                <span>🚚</span>
                <span className="font-semibold text-gray-900">{deliverToday}</span>
                <span className="text-gray-500">{deliverToday !== 1 ? "deliveries" : "delivery"} scheduled</span>
              </button>
            )}
            {weighToday > 0 && (
              <button onClick={() => router.push("/admin/orders")}
                className="flex items-center gap-1.5 text-sm hover:text-red-600 transition-colors">
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
              chart={revDays.length > 0 ? <MiniBarChart days={revDays} /> : undefined}
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
                  batch.critical ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200"
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

        {/* Low Stock */}
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
              <button onClick={() => router.push("/admin/purchase-orders")}
                className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                View POs →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {lowStockProducts.slice(0, 12).map(p => (
                <div key={p.id} className={`rounded-xl border px-3 py-2 text-xs flex flex-col gap-1 ${
                  p.tier === 0 ? "bg-red-50 border-red-300" :
                  p.tier === 1 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                }`}>
                  <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className={`font-bold ${p.tier === 0 ? "text-red-600" : p.tier === 1 ? "text-red-500" : "text-yellow-700"}`}>
                    {p.tier === 0 ? "❌ Out" : `${formatQty(p.currentStock)} ${p.unit}`}
                  </p>
                  <p className="text-gray-400">Min: {formatQty(p.minStock)}</p>
                  <button onClick={() => router.push("/admin/purchase-orders")}
                    className="mt-0.5 text-xs py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium text-center">
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

        {/* Kanban Pipeline */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {PIPELINE_COLS.map(col => {
              const colList = colOrders[col.key] || [];
              const isDragTarget = dragOverCol === col.key && dragOrderId !== null;
              return (
                <div
                  key={col.key}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
                  onDrop={() => handleDrop(col.key, col.dropStatus)}
                  className={`bg-white rounded-2xl p-4 space-y-3 border transition-all min-h-[120px] ${
                    isDragTarget ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 text-sm">{col.label}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>{colList.length}</span>
                  </div>
                  {isDragTarget && (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg py-4 text-center text-xs text-blue-400 font-medium">
                      Drop to move → {col.dropStatus}
                    </div>
                  )}
                  {colList.length === 0 && !isDragTarget && (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {col.key === "preparing" ? "All clear! 🎉" : col.key === "toDeliver" ? "Nothing to deliver" : "All paid! ✅"}
                    </p>
                  )}
                  {colList.map(o => <OrderCard key={o.id} order={o} />)}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom row: Activity Feed + Top Tables */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Recent Activity Feed */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="font-bold text-gray-900 text-sm mb-3">🕐 Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No recent activity</p>
              ) : (
                <div className="space-y-0 divide-y divide-gray-50">
                  {recentActivity.map((item, i) => (
                    <div key={item.id + i} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 text-sm flex-shrink-0">
                        {item.type === "invoice" ? "🧾" : "📦"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.text}</p>
                        {item.sub && <p className="text-xs text-gray-400 truncate">{item.sub}</p>}
                      </div>
                      <span className="text-xs text-gray-300 flex-shrink-0 tabular-nums">{timeAgo(item.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Customers + Top Products */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h2 className="font-bold text-gray-900 text-sm mb-3">🏆 Top Customers</h2>
                {topCustomers.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase text-left border-b border-gray-100">
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium text-center">Orders</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {topCustomers.map((c, i) => (
                        <tr key={c.name} className="hover:bg-gray-50">
                          <td className="py-2 flex items-center gap-2">
                            <span className="text-gray-300 font-bold w-4">{i + 1}</span>
                            <span className="font-medium text-gray-800 truncate max-w-[140px]">{c.name}</span>
                          </td>
                          <td className="py-2 text-center text-gray-500">{c.count}</td>
                          <td className="py-2 text-right font-semibold text-gray-900">${formatPrice(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h2 className="font-bold text-gray-900 text-sm mb-3">🐟 Top Products</h2>
                {topProducts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase text-left border-b border-gray-100">
                        <th className="pb-2 font-medium">Product</th>
                        <th className="pb-2 font-medium text-center">Orders</th>
                        <th className="pb-2 font-medium text-right">Qty Sold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {topProducts.map((p, i) => (
                        <tr key={p.name} className="hover:bg-gray-50">
                          <td className="py-2 flex items-center gap-2">
                            <span className="text-gray-300 font-bold w-4">{i + 1}</span>
                            <span className="font-medium text-gray-800 truncate max-w-[140px]">{p.name}</span>
                          </td>
                          <td className="py-2 text-center text-gray-500">{p.orders}</td>
                          <td className="py-2 text-right font-semibold text-gray-900">{formatQty(p.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
