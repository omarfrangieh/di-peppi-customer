"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { formatPrice, formatQty } from "@/lib/formatters";

/* ─── helpers ─── */

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function trendLabel(cur: number, prev: number, period = "last week"): { text: string; up: boolean | null } {
  if (prev === 0 && cur === 0) return { text: "—", up: null };
  if (prev === 0) return { text: "New", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: `Same as ${period}`, up: null };
  return { text: `${pct > 0 ? "▲" : "▼"}${Math.abs(pct)}% vs ${period}`, up: pct > 0 };
}

function timeAgo(iso: string) {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── revenue sparkline ─── */

function Sparkline({ days }: { days: { label: string; value: number }[] }) {
  const max = Math.max(...days.map(d => d.value), 1);
  const W = 88, H = 32, n = days.length;
  const xs = days.map((_, i) => (i / Math.max(n - 1, 1)) * W);
  const ys = days.map(d => H - 4 - Math.round((d.value / max) * (H - 10)));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <div className="mt-2">
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <polyline points={pts} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          className="stroke-green-500 dark:stroke-green-400" />
        {days.map((d, i) => d.value > 0 ? (
          <circle key={i} cx={xs[i]} cy={ys[i]} r={2} className="fill-green-500 dark:fill-green-400" />
        ) : null)}
      </svg>
      <div className="flex mt-0.5" style={{ gap: 3 }}>
        {days.map((d, i) => (
          <span key={i} style={{ width: 10, fontSize: 7, display: "inline-block" }}
            className="text-center text-gray-400">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ─── command palette ─── */

type SearchResult = { id: string; icon: string; label: string; sub: string; href: string };

function CommandPalette({
  open, onClose, query, setQuery, results, onSelect, router,
}: {
  open: boolean; onClose: () => void; query: string; setQuery: (q: string) => void;
  results: SearchResult[]; onSelect: (href: string) => void; router: ReturnType<typeof useRouter>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  if (!open) return null;

  const quickLinks: SearchResult[] = [
    { id: "q-orders",    icon: "📦", label: "Orders",          sub: "View all orders",         href: "/admin/orders" },
    { id: "q-products",  icon: "🐟", label: "Products",        sub: "Manage products",         href: "/admin/products" },
    { id: "q-invoices",  icon: "🧾", label: "Invoices",        sub: "View invoices",           href: "/invoices" },
    { id: "q-customers", icon: "👥", label: "Customers",       sub: "Manage customers",        href: "/admin/customers" },
    { id: "q-pos",       icon: "📋", label: "Purchase Orders", sub: "View POs",                href: "/admin/purchase-orders" },
    { id: "q-new-order", icon: "✨", label: "New Order",       sub: "Create a new order",      href: "/admin/orders/new" },
  ];
  const items = query.trim() ? results : quickLinks;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4"
      onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-400 text-lg">🔍</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search orders, products, customers…"
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400" />
          <kbd className="text-xs text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {!query.trim() && (
            <p className="text-xs text-gray-400 px-4 pt-1.5 pb-1 uppercase tracking-wider font-medium">Quick Links</p>
          )}
          {query.trim() && items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No results for "{query}"</p>
          )}
          {items.map(r => (
            <button key={r.id} onClick={() => onSelect(r.href)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors">
              <span className="text-lg w-6 text-center flex-shrink-0">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.label}</p>
                <p className="text-xs text-gray-400 truncate">{r.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── pipeline columns ─── */

const PIPELINE_COLS = [
  { key: "preparing", label: "📝 Draft & Preparing", dropStatus: "Preparing", badge: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300", emptyMsg: "All clear!" },
  { key: "toDeliver", label: "🚚 To Deliver",        dropStatus: "To Deliver", badge: "bg-orange-100 text-orange-600",                                  emptyMsg: "Nothing to deliver" },
  { key: "delivered", label: "✅ Delivered",          dropStatus: "Delivered",  badge: "bg-green-100 text-green-700",                                    emptyMsg: "All paid!" },
] as const;

/* ─── main component ─── */

export default function Dashboard() {
  const router = useRouter();

  // data
  const [orders, setOrders]                   = useState<any[]>([]);
  const [weighingOrderIds, setWeighingOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [invoiceStats, setInvoiceStats]       = useState({ outstanding: 0, overdueCount: 0 });
  const [recentActivity, setRecentActivity]   = useState<{ id: string; type: string; text: string; sub: string; at: string }[]>([]);
  const [topCustomers, setTopCustomers]       = useState<{ name: string; total: number; count: number }[]>([]);
  const [topProducts, setTopProducts]         = useState<{ name: string; qty: number; orders: number }[]>([]);
  const [revDays, setRevDays]                 = useState<{ label: string; value: number }[]>([]);
  const [allProducts, setAllProducts]         = useState<{ id: string; name: string }[]>([]);

  // UI state
  const [density, setDensity]     = useState<"comfortable" | "compact">("comfortable");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "all">("all");
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowStockPOModal, setShowLowStockPOModal] = useState(false);
  const [lowStockModalItems, setLowStockModalItems]   = useState<any[]>([]);
  const [creatingPOs, setCreatingPOs]                 = useState(false);

  const todayISO = new Date().toISOString().slice(0, 10);

  // ⌘K keyboard shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(o => !o); }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
      const prodList: { id: string; name: string }[] = [];
      productsSnap.forEach((d: any) => {
        const p = d.data();
        productNames[d.id] = p.name || "Unknown";
        prodList.push({ id: d.id, name: p.name || "" });
        if (p.requiresWeighing) weighingProductIds.add(d.id);
      });
      setAllProducts(prodList);

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
          .sort((a, b) => b.orders - a.orders).slice(0, 5)
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
            id: d.id, productName: productNames[m.productId] || m.productName || "Unknown",
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
          lowStock.push({ id: d.id, name: p.name, currentStock: cur, minStock: min, unit: p.unit || "", tier, pct, supplierId: p.supplierId || "", supplier: p.supplier || "" });
        }
      });
      lowStock.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : a.pct - b.pct);
      setLowStockProducts(lowStock);

      // Invoices + activity
      const invoicesSnap = await getDocs(collection(db, "invoices"));
      let outstanding = 0, overdueCount = 0;
      const invoiceActivity: any[] = [];
      invoicesSnap.forEach(d => {
        const inv = d.data();
        if (inv.status === "issued" || inv.status === "overdue") {
          outstanding += Number(inv.finalTotal || 0);
          if (inv.status === "overdue" || (inv.dueDate && inv.dueDate < todayISO)) overdueCount += 1;
        }
        if (inv.status === "paid" && inv.paidAt) {
          invoiceActivity.push({ id: d.id, type: "invoice", text: `Invoice ${inv.invoiceNumber || d.id} paid`, sub: inv.customerName || "", at: inv.paidAt });
        }
      });
      setInvoiceStats({ outstanding, overdueCount });

      const orderActivity = orderArr.filter(o => o.updatedAt || o.createdAt).map(o => ({
        id: o.id, type: "order", text: `${o.name || "Order"} → ${o.status}`, sub: o.customerName || "", at: o.updatedAt || o.createdAt,
      }));
      setRecentActivity([...orderActivity, ...invoiceActivity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10));

      // Top customers
      const custMap: Record<string, { total: number; count: number }> = {};
      orderArr.forEach(o => {
        const n = o.customerName || "Unknown";
        if (!custMap[n]) custMap[n] = { total: 0, count: 0 };
        custMap[n].total += Number(o.finalTotal || 0);
        custMap[n].count += 1;
      });
      setTopCustomers(Object.entries(custMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 5));

      // 7-day revenue chart
      const delivered = orderArr.filter(o => o.status === "Delivered");
      setRevDays(Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - 6 + i);
        const iso = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" })[0];
        const value = delivered.filter(o => (o.deliveryDate || o.updatedAt || "").slice(0, 10) === iso)
          .reduce((s: number, o: any) => s + Number(o.finalTotal || 0), 0);
        return { label, value };
      }));
    } finally {
      setLoading(false);
    }
  };

  // Date range filter applied to pipeline + KPIs
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const twISO = thisWeekStart.toISOString();
  const lwISO = lastWeekStart.toISOString();

  const filteredOrders = orders.filter(o => {
    if (dateRange === "all") return true;
    const d = (o.deliveryDate || o.createdAt || "").slice(0, 10);
    if (dateRange === "today") return d === todayISO;
    if (dateRange === "week")  return d >= twISO.slice(0, 10);
    if (dateRange === "month") return d >= firstOfMonth;
    return true;
  });

  const activeOrders    = filteredOrders.filter(o => !["Delivered", "Cancelled", "Canceled"].includes(o.status));
  const deliveredOrders = filteredOrders.filter(o => o.status === "Delivered");
  const colOrders = {
    preparing: filteredOrders.filter(o => ["Draft", "Confirmed", "Preparing"].includes(o.status)).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "")),
    toDeliver: filteredOrders.filter(o => o.status === "To Deliver").sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "")),
    delivered: filteredOrders.filter(o => o.status === "Delivered"),
  } as Record<string, any[]>;

  // Period-aware trends
  const revTotal       = deliveredOrders.reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const yesterdayISO   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10);
  const lastMonthEnd   = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);

  const activeThisWeek  = orders.filter(o => (o.createdAt || "") >= twISO).length;
  const activeLastWeek  = orders.filter(o => (o.createdAt || "") >= lwISO && (o.createdAt || "") < twISO).length;
  const activeToday     = orders.filter(o => String(o.createdAt || "").slice(0, 10) === todayISO).length;
  const activeYesterday = orders.filter(o => String(o.createdAt || "").slice(0, 10) === yesterdayISO).length;
  const activeThisMonth = orders.filter(o => String(o.createdAt || "").slice(0, 10) >= firstOfMonth).length;
  const activeLastMonth = orders.filter(o => { const d = String(o.createdAt || "").slice(0, 10); return d >= lastMonthStart && d <= lastMonthEnd; }).length;

  const revThisWeek  = orders.filter(o => o.status === "Delivered" && (o.updatedAt || o.createdAt || "") >= twISO).reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revLastWeek  = orders.filter(o => { const d = o.updatedAt || o.createdAt || ""; return o.status === "Delivered" && d >= lwISO && d < twISO; }).reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revToday     = orders.filter(o => o.status === "Delivered" && String(o.deliveryDate || o.updatedAt || "").slice(0, 10) === todayISO).reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revYesterday = orders.filter(o => o.status === "Delivered" && String(o.deliveryDate || o.updatedAt || "").slice(0, 10) === yesterdayISO).reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revThisMonth = orders.filter(o => o.status === "Delivered" && String(o.deliveryDate || o.updatedAt || "").slice(0, 10) >= firstOfMonth).reduce((s, o) => s + Number(o.finalTotal || 0), 0);
  const revLastMonth = orders.filter(o => { const d = String(o.deliveryDate || o.updatedAt || "").slice(0, 10); return o.status === "Delivered" && d >= lastMonthStart && d <= lastMonthEnd; }).reduce((s, o) => s + Number(o.finalTotal || 0), 0);

  const orderTrend = dateRange === "today" ? trendLabel(activeToday, activeYesterday, "yesterday") :
                     dateRange === "week"  ? trendLabel(activeThisWeek, activeLastWeek, "last week") :
                     dateRange === "month" ? trendLabel(activeThisMonth, activeLastMonth, "last month") :
                     { text: "—", up: null };
  const revTrend   = dateRange === "today" ? trendLabel(revToday, revYesterday, "yesterday") :
                     dateRange === "week"  ? trendLabel(revThisWeek, revLastWeek, "last week") :
                     dateRange === "month" ? trendLabel(revThisMonth, revLastMonth, "last month") :
                     { text: "—", up: null };

  // Today's snapshot (always from all orders)
  const packToday    = orders.filter(o => ["Draft", "Confirmed", "Preparing"].includes(o.status) && o.deliveryDate === todayISO).length;
  const deliverToday = orders.filter(o => o.status === "To Deliver" && o.deliveryDate === todayISO).length;
  const weighToday   = orders.filter(o => weighingOrderIds.has(o.id) && !["Delivered", "Cancelled", "Canceled"].includes(o.status) && o.deliveryDate === todayISO).length;

  // ⌘K search results
  const q = searchQuery.trim().toLowerCase();
  const searchResults: SearchResult[] = q ? [
    ...orders.filter(o => (o.name || "").toLowerCase().includes(q) || (o.customerName || "").toLowerCase().includes(q))
      .slice(0, 5).map(o => ({ id: "o-" + o.id, icon: "📦", label: o.name || "Order", sub: `${o.customerName} · ${o.status}`, href: `/admin/orders/${o.id}` })),
    ...allProducts.filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 3).map(p => ({ id: "p-" + p.id, icon: "🐟", label: p.name, sub: "Product", href: "/admin/products" })),
    ...topCustomers.filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 3).map(c => ({ id: "c-" + c.name, icon: "👥", label: c.name, sub: `${c.count} orders · $${formatPrice(c.total)}`, href: "/admin/customers" })),
  ] : [];

  // Drag & drop
  const handleDrop = async (colKey: string, dropStatus: string) => {
    if (!dragOrderId) return;
    const order = orders.find(o => o.id === dragOrderId);
    if (!order || order.status === dropStatus) { setDragOrderId(null); setDragOverCol(null); return; }
    try {
      await updateDoc(doc(db, "orders", dragOrderId), { status: dropStatus, updatedAt: new Date().toISOString() });
      setOrders(prev => prev.map(o => o.id === dragOrderId ? { ...o, status: dropStatus } : o));
    } catch { alert("Failed to update status"); }
    finally { setDragOrderId(null); setDragOverCol(null); }
  };


  /* ─── sub-components ─── */

  const KPICard = ({
    label, value, sub, color, bg, trend, href, chart,
  }: {
    label: string; value: string | number; sub: string; color: string; bg: string;
    trend?: { text: string; up: boolean | null }; href?: string; chart?: React.ReactNode;
  }) => (
    <div onClick={() => href && router.push(href)}
      className={`rounded-xl border px-4 py-3 ${bg} ${href ? "cursor-pointer hover:shadow-md transition-all" : ""}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      {trend && (
        <p className={`text-xs font-medium mt-1.5 ${trend.up === true ? "text-green-600 dark:text-green-400" : trend.up === false ? "text-red-500" : "text-gray-400"}`}>
          {trend.text}
        </p>
      )}
      {chart}
    </div>
  );

  const isCompact = density === "compact";

  const OrderCard = ({ order }: { order: any }) => {
    const isOverdue  = order.deliveryDate && order.deliveryDate <= todayISO && !["Delivered", "Cancelled", "Canceled"].includes(order.status);
    const isDragging = dragOrderId === order.id;
    const statusDot: Record<string, string> = {
      Draft: "bg-gray-400", Confirmed: "bg-blue-400", Preparing: "bg-yellow-400",
      "To Deliver": "bg-orange-400", Delivered: "bg-green-500", Cancelled: "bg-red-400",
    };

    if (isCompact) {
      return (
        <div draggable
          onDragStart={() => setDragOrderId(order.id)}
          onDragEnd={() => { setDragOrderId(null); setDragOverCol(null); }}
          onClick={() => router.push(`/admin/orders/${order.id}`)}
          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none text-xs ${isDragging ? "opacity-40" : ""} ${
            order.status === "Draft"      ? "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600" :
            order.status === "Preparing"  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200" :
            order.status === "To Deliver" ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200" :
            order.status === "Delivered"  ? "bg-green-50 dark:bg-green-900/20 border-green-200" :
            "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[order.status] || "bg-gray-400"}`} />
          <span className="font-medium text-gray-900 dark:text-white truncate flex-1">{order.customerName || order.name}</span>
          {weighingOrderIds.has(order.id) && <span className="text-red-500 flex-shrink-0">⚖️</span>}
          {isOverdue && <span className="text-red-400 flex-shrink-0">⚠️</span>}
          <span className="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">${formatPrice(order.finalTotal || 0)}</span>
        </div>
      );
    }

    return (
      <div draggable
        onDragStart={() => setDragOrderId(order.id)}
        onDragEnd={() => { setDragOrderId(null); setDragOverCol(null); }}
        onClick={() => router.push(`/admin/orders/${order.id}`)}
        className={`rounded-lg border px-4 py-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none ${isDragging ? "opacity-40" : ""} ${
          order.status === "Draft"      ? "bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600" :
          order.status === "Preparing"  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200" :
          order.status === "To Deliver" ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200" :
          order.status === "Delivered"  ? "bg-green-50 dark:bg-green-900/20 border-green-200" :
          (order.status === "Cancelled" || order.status === "Canceled") ? "bg-red-50 dark:bg-red-900/20 border-red-200" :
          "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{order.customerName || order.name}</p>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                {order.customerType || "B2C"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{order.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                order.status === "Draft"      ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" :
                order.status === "Preparing"  ? "bg-yellow-50 text-yellow-700" :
                order.status === "To Deliver" ? "bg-orange-50 text-orange-600" :
                order.status === "Delivered"  ? "bg-green-50 text-green-700" :
                order.status === "Cancelled"  ? "bg-red-50 text-red-500" :
                "bg-gray-100 dark:bg-gray-700 text-gray-500"
              }`}>{order.status || "Draft"}</span>
              {weighingOrderIds.has(order.id) && ["Draft", "Confirmed", "Preparing"].includes(order.status) && (
                <span className="inline-block text-xs px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-600 border border-red-300">⚖️ Weigh!</span>
              )}
            </div>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0 ml-2">
            ${formatPrice(order.finalTotal || 0)}
          </p>
        </div>
        {order.deliveryDate && (
          <p className={`text-xs mt-1 ${isOverdue ? "text-red-500 font-bold" : "text-gray-400 font-medium"}`}>
            {isOverdue ? "⚠️ " : ""}Delivery: {formatDate(order.deliveryDate)}
          </p>
        )}
      </div>
    );
  };

  /* ─── render ─── */

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">

      {/* Command Palette */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)}
        query={searchQuery} setQuery={setSearchQuery} results={searchResults}
        onSelect={href => { router.push(href); setSearchOpen(false); setSearchQuery(""); }}
        router={router} />

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold flex-shrink-0" style={{ color: "#B5535A" }}>Dashboard</h1>

          {/* Search trigger */}
          <button onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 hover:border-gray-300 transition-colors flex-1 max-w-xs">
            <span>🔍</span>
            <span className="flex-1 text-left text-xs">Search…</span>
            <kbd className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 hidden md:inline">⌘K</kbd>
          </button>

          <div className="flex items-center gap-2">
            {/* Density toggle */}
            <button onClick={() => setDensity(d => d === "comfortable" ? "compact" : "comfortable")}
              title={density === "comfortable" ? "Switch to compact" : "Switch to comfortable"}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-xs font-medium">
              {density === "comfortable" ? "⊞ Compact" : "⊟ Comfy"}
            </button>

<button onClick={() => router.push("/admin/orders/new")}
              className="px-4 py-1.5 text-sm text-white rounded-xl font-bold flex-shrink-0"
              style={{ backgroundColor: "#1B2A5E" }}>
              + New Order
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Today's Snapshot */}
        {!loading && (packToday > 0 || deliverToday > 0 || weighToday > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center gap-6 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</span>
            {packToday > 0 && (
              <button onClick={() => router.push("/admin/orders")} className="flex items-center gap-1.5 text-sm hover:text-blue-600 transition-colors">
                <span>📦</span><span className="font-semibold text-gray-900 dark:text-white">{packToday}</span>
                <span className="text-gray-500 dark:text-gray-400">order{packToday !== 1 ? "s" : ""} to pack</span>
              </button>
            )}
            {deliverToday > 0 && (
              <button onClick={() => router.push("/admin/orders")} className="flex items-center gap-1.5 text-sm hover:text-orange-600 transition-colors">
                <span>🚚</span><span className="font-semibold text-gray-900 dark:text-white">{deliverToday}</span>
                <span className="text-gray-500 dark:text-gray-400">{deliverToday !== 1 ? "deliveries" : "delivery"} scheduled</span>
              </button>
            )}
            {weighToday > 0 && (
              <button onClick={() => router.push("/admin/orders")} className="flex items-center gap-1.5 text-sm hover:text-red-600 transition-colors">
                <span>⚖️</span><span className="font-semibold text-gray-900 dark:text-white">{weighToday}</span>
                <span className="text-gray-500 dark:text-gray-400">{weighToday !== 1 ? "orders" : "order"} need weighing</span>
              </button>
            )}
          </div>
        )}

        {/* Date range filter */}
        {!loading && (
          <div className="flex items-center gap-2">
            {(["today", "week", "month", "all"] as const).map(r => (
              <button key={r} onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dateRange === r
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}>
                {r === "today" ? "Today" : r === "week" ? "This Week" : r === "month" ? "This Month" : "All Time"}
              </button>
            ))}
            {dateRange !== "all" && (
              <span className="text-xs text-gray-400 ml-1">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* KPI Bar */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Active Orders" value={activeOrders.length}
              sub={`${colOrders.toDeliver.length} ready to deliver`}
              color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900"
              trend={orderTrend} href="/admin/orders" />
            <KPICard
              label="Revenue (Delivered)"
              value={"$" + revTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              sub={`${deliveredOrders.length} delivered orders`}
              color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900"
              trend={revTrend}
              chart={<Sparkline days={revDays} />} />
            <KPICard
              label="Outstanding Invoices"
              value={"$" + invoiceStats.outstanding.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              sub={invoiceStats.overdueCount > 0 ? `${invoiceStats.overdueCount} overdue` : "All on time"}
              color={invoiceStats.overdueCount > 0 ? "text-red-700 dark:text-red-400" : "text-gray-700 dark:text-gray-200"}
              bg={invoiceStats.overdueCount > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"}
              href="/invoices" />
            <KPICard
              label="⚖️ Need Weighing"
              value={orders.filter(o => weighingOrderIds.has(o.id) && !["Delivered","Cancelled","Canceled"].includes(o.status)).length}
              sub="active orders with weigh items"
              color="text-orange-700 dark:text-orange-400" bg="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900"
              href="/admin/orders" />
          </div>
        )}

        {/* Expiry Alerts */}
        {expiringBatches.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-orange-200 dark:border-orange-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">📅 Expiry Alerts</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expiringBatches.some(b => b.expired || b.critical) ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                {expiringBatches.length} batch{expiringBatches.length !== 1 ? "es" : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {expiringBatches.map(batch => (
                <div key={batch.id} className={`rounded-xl border px-3 py-2 text-xs ${
                  batch.expired ? "bg-red-50 dark:bg-red-900/20 border-red-300" :
                  batch.critical ? "bg-red-50 dark:bg-red-900/10 border-red-200" : "bg-orange-50 dark:bg-orange-900/10 border-orange-200"
                }`}>
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{batch.productName}</p>
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">Qty: <span className="font-medium">{formatQty(batch.quantity)}</span></p>
                  <p className={`font-semibold mt-0.5 ${batch.expired ? "text-red-700" : batch.critical ? "text-red-500" : "text-orange-600"}`}>
                    {batch.expired ? "❌ " : batch.critical ? "⚠️ " : "🟡 "}{new Date(batch.expiryDate).toLocaleDateString("en-GB")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low Stock PO Modal */}
        {showLowStockPOModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Create POs for Low Stock</h3>
                <button onClick={() => setShowLowStockPOModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none w-6 h-6 flex items-center justify-center">×</button>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 px-5">
                {lowStockModalItems.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <input type="checkbox" checked={item.checked}
                      onChange={e => setLowStockModalItems(prev => prev.map((i: any) => i.id === item.id ? { ...i, checked: e.target.checked } : i))}
                      className="w-4 h-4 rounded border-gray-300 accent-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                        {item.tier === 0 && <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0 animate-pulse" />}
                        <span className="truncate">{item.name}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.tier === 0 ? "Out of stock" : `${formatQty(item.currentStock)} ${item.unit} · min ${formatQty(item.minStock)}`}
                        {item.supplier ? ` · ${item.supplier}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-gray-400">Qty:</span>
                      <input type="number" value={item.orderQty} min={0.1} step={0.1}
                        onChange={e => setLowStockModalItems(prev => prev.map((i: any) => i.id === item.id ? { ...i, orderQty: Number(e.target.value) } : i))}
                        className="w-20 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                <span className="text-xs text-gray-400">{lowStockModalItems.filter((i: any) => i.checked).length} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowLowStockPOModal(false)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const selected = lowStockModalItems.filter((i: any) => i.checked && i.orderQty > 0);
                      if (!selected.length) return;
                      setCreatingPOs(true);
                      try {
                        const year = new Date().getFullYear();
                        const bySupplier: Record<string, any[]> = {};
                        selected.forEach((item: any) => {
                          const key = item.supplierId || "unknown";
                          if (!bySupplier[key]) bySupplier[key] = [];
                          bySupplier[key].push(item);
                        });
                        for (const [supplierId, items] of Object.entries(bySupplier)) {
                          let poNumber = "";
                          const counterRef = doc(db, "settings", "poCounter");
                          await runTransaction(db, async (tx) => {
                            const snap = await tx.get(counterRef);
                            const cur = snap.exists() ? snap.data().count : 0;
                            const next = cur + 1;
                            tx.set(counterRef, { count: next });
                            poNumber = `PO-${year}-${String(next).padStart(3, "0")}`;
                          });
                          await addDoc(collection(db, "purchaseOrders"), {
                            poNumber,
                            orderId: null,
                            invoiceId: null,
                            supplierId: supplierId === "unknown" ? null : supplierId,
                            supplierName: items[0].supplier || supplierId,
                            poDate: todayISO,
                            deliveryDate: "",
                            status: "Generated",
                            poTotal: 0,
                            source: "low-stock",
                            items: items.map((i: any) => ({
                              productId: i.id,
                              productName: i.name,
                              quantity: i.orderQty,
                              unitCostPrice: 0,
                              lineTotal: 0,
                              weightNote: "",
                            })),
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          });
                        }
                        setShowLowStockPOModal(false);
                        router.push("/admin/purchase-orders");
                      } catch { alert("Failed to create POs"); }
                      finally { setCreatingPOs(false); }
                    }}
                    disabled={creatingPOs || lowStockModalItems.filter((i: any) => i.checked).length === 0}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {creatingPOs ? "Creating…" : "Submit POs"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Low Stock — left border accent + pulse on tier 0 */}
        {lowStockProducts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-yellow-200 dark:border-yellow-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">📦 Low Stock</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">{lowStockProducts.length} product{lowStockProducts.length !== 1 ? "s" : ""}</span>
                {lowStockProducts.some(p => p.tier === 0) && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                    {lowStockProducts.filter(p => p.tier === 0).length} out of stock
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setLowStockModalItems(
                      [...lowStockProducts].sort((a, b) => a.tier - b.tier || a.pct - b.pct).map(p => ({
                        ...p,
                        checked: true,
                        orderQty: Math.max(0.1, Math.round((p.minStock - p.currentStock) * 10) / 10),
                      }))
                    );
                    setShowLowStockPOModal(true);
                  }}
                  className="text-xs px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-medium">
                  + Create POs for Low Stock
                </button>
                <button onClick={() => router.push("/admin/purchase-orders")} className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  View POs →
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {lowStockProducts.slice(0, 12).map(p => {
                const fillPct = p.currentStock <= 0 ? 0 : Math.min(100, Math.round((p.currentStock / p.minStock) * 100));
                return (
                  <div key={p.id} className={`relative rounded-xl overflow-hidden border text-xs flex flex-col gap-1 ${
                    p.tier === 0 ? "bg-red-50 dark:bg-red-900/20 border-red-300" :
                    p.tier === 1 ? "bg-red-50 dark:bg-red-900/10 border-red-200" :
                    "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200"
                  }`}>
                    {/* Left accent bar */}
                    <div className={`absolute inset-y-0 left-0 w-1 ${
                      p.tier === 0 ? "bg-red-500" : p.tier === 1 ? "bg-red-400" : "bg-yellow-400"
                    }`} />
                    <div className="pl-4 pr-3 py-2 flex flex-col gap-1">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className={`font-bold flex items-center gap-1 ${p.tier === 0 ? "text-red-600" : p.tier === 1 ? "text-red-500" : "text-yellow-700"}`}>
                        {p.tier === 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />}
                        {p.tier === 0 ? "❌ Out" : `${formatQty(p.currentStock)} ${p.unit}`}
                      </p>
                      {/* Stock progress bar */}
                      <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div className={`h-full rounded-full ${
                          fillPct === 0 ? "bg-red-500" :
                          fillPct < 25  ? "bg-red-500" :
                          fillPct < 75  ? "bg-yellow-500" :
                          "bg-green-500"
                        }`} style={{ width: `${fillPct}%` }} />
                      </div>
                      <p className="text-gray-400">Min: {formatQty(p.minStock)}</p>
                    </div>
                  </div>
                );
              })}
              {lowStockProducts.length > 12 && (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2 text-xs flex items-center justify-center text-gray-400">
                  +{lowStockProducts.length - 12} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kanban Pipeline — drag & drop */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-900 dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className={`grid grid-cols-3 ${isCompact ? "gap-2" : "gap-4"}`}>
            {PIPELINE_COLS.map(col => {
              const list = colOrders[col.key] || [];
              const isDragTarget = dragOverCol === col.key && dragOrderId !== null;
              return (
                <div key={col.key}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
                  onDrop={() => handleDrop(col.key, col.dropStatus)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl border transition-all min-h-[80px] ${isCompact ? "p-2 space-y-1" : "p-4 space-y-3"} ${
                    isDragTarget ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-700"
                  }`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 dark:text-white text-sm">{col.label}</h2>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>{list.length}</span>
                      {list.length > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          · ${formatPrice(list.reduce((s, o) => s + Number(o.finalTotal || 0), 0))}
                        </span>
                      )}
                    </div>
                  </div>
                  {isDragTarget && (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg py-4 text-center text-xs text-blue-400 font-medium">
                      Drop → {col.dropStatus}
                    </div>
                  )}
                  {list.length === 0 && !isDragTarget && (
                    <p className="text-xs text-gray-400 text-center py-6">{col.emptyMsg}</p>
                  )}
                  {list.map(o => <OrderCard key={o.id} order={o} />)}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom row: Activity + Top tables */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">🕐 Recent Activity</h2>
              {recentActivity.length === 0
                ? <p className="text-xs text-gray-400 text-center py-6">No recent activity</p>
                : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {recentActivity.map((item, i) => (
                      <div key={item.id + i} className="flex items-start gap-3 py-2.5">
                        <span className="text-sm flex-shrink-0 mt-0.5">{item.type === "invoice" ? "🧾" : "📦"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.text}</p>
                          {item.sub && <p className="text-xs text-gray-400 truncate">{item.sub}</p>}
                        </div>
                        <span className="text-xs text-gray-300 dark:text-gray-500 flex-shrink-0 tabular-nums">{timeAgo(item.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Top Customers + Top Products */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">🏆 Top Customers</h2>
                {topCustomers.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                  : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase text-left border-b border-gray-100 dark:border-gray-700">
                          <th className="pb-2 font-medium">Customer</th>
                          <th className="pb-2 font-medium text-center">Orders</th>
                          <th className="pb-2 font-medium text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {topCustomers.map((c, i) => (
                          <tr key={c.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300 dark:text-gray-600 font-bold w-4">{i + 1}</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{c.name}</span>
                              </div>
                            </td>
                            <td className="py-2 text-center text-gray-500 dark:text-gray-400">{c.count}</td>
                            <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">${formatPrice(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">🐟 Top Products</h2>
                {topProducts.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                  : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase text-left border-b border-gray-100 dark:border-gray-700">
                          <th className="pb-2 font-medium">Product</th>
                          <th className="pb-2 font-medium text-center">Orders</th>
                          <th className="pb-2 font-medium text-right">Qty Sold</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {topProducts.map((p, i) => (
                          <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300 dark:text-gray-600 font-bold w-4">{i + 1}</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{p.name}</span>
                              </div>
                            </td>
                            <td className="py-2 text-center text-gray-500 dark:text-gray-400">{p.orders}</td>
                            <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{formatQty(p.qty)}</td>
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
