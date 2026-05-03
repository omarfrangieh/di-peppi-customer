"use client";
import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { showToast } from "@/lib/toast";
import { exportToExcel, exportToPDF } from "@/lib/exportReports";
import { buildWhatsAppReportShare } from "@/lib/whatsappShare";
import { db } from "@/lib/firebase";
import { formatQty, formatPrice, toTitleCase } from "@/lib/formatters";

function money(v: number) { return "$" + formatPrice(v); }
function pct(v: number) { return Number(v || 0).toFixed(1) + "%"; }

const TABS = ["Sales", "Customers", "Products", "Profitability", "Stock", "Collections"];

export default function ReportsPage() {
  const [tab, setTab] = useState("Sales");
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [fromDate, setFromDate] = useState(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
  // Default toDate = 30 days from now so current & upcoming orders are always visible
  const [toDate, setToDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10));
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"All" | "B2B" | "B2C">("All");
  const [showExport, setShowExport] = useState(false);
  const [exportTabs, setExportTabs] = useState<string[]>(["Sales", "Customers", "Products", "Stock", "Collections"]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [ordersRes, itemsSnap, invoicesSnap, productsSnap, movementsSnap] = await Promise.all([
        fetch("https://us-central1-di-peppi.cloudfunctions.net/getOrders").then(r => r.json()),
        getDocs(collection(db, "orderItems")),
        getDocs(collection(db, "invoices")),
        getDocs(collection(db, "products")),
        getDocs(collection(db, "stockMovements")),
      ]);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInvoices(invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMovements(movementsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally { setLoading(false); }
  };

  const filteredOrders = useMemo(() => orders.filter(o => {
    // Use createdAt as the primary date (when the sale was made),
    // fall back to deliveryDate / orderDate for legacy records
    const d = String(o.createdAt || o.deliveryDate || o.orderDate || "").slice(0, 10);
    const matchDate = d >= fromDate && d <= toDate
      && o.status !== "Cancelled" && o.status !== "Canceled";
    const matchType = customerTypeFilter === "All" || o.customerType === customerTypeFilter;
    return matchDate && matchType;
  }), [orders, fromDate, toDate, customerTypeFilter]);

  const filteredItems = useMemo(() => {
    const ids = new Set(filteredOrders.map((o: any) => o.id));
    return items.filter(i => ids.has(i.orderId));
  }, [items, filteredOrders]);

  // Revenue = all non-cancelled orders in period (same logic as YTD and Profit)
  const totalRevenue = useMemo(() => filteredOrders.reduce((s, o) => s + Number(o.finalTotal || o.total || o.grandTotal || 0), 0), [filteredOrders]);
  const totalProfit = useMemo(() => filteredItems.reduce((s, i) => s + Number(i.profit || 0), 0), [filteredItems]);
  const ytdRevenue = useMemo(() => orders.filter(o => {
    const d = String(o.createdAt || o.deliveryDate || o.orderDate || "").slice(0, 10);
    return d >= `${new Date().getFullYear()}-01-01`
      && o.status !== "Cancelled" && o.status !== "Canceled";
  }).reduce((s, o) => s + Number(o.finalTotal || o.total || o.grandTotal || 0), 0), [orders]);

  const salesByPeriod = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; orders: number }> = {};
    const periodKey = (d: string) => period === "daily" ? d : period === "yearly" ? d.slice(0, 4) : period === "monthly" ? d.slice(0, 7) : (() => {
      const dt = new Date(d); const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10);
    })();
    filteredOrders.forEach(o => {
      const d = String(o.createdAt || o.deliveryDate || o.orderDate || "").slice(0, 10); if (!d) return;
      const key = periodKey(d);
      if (!map[key]) map[key] = { revenue: 0, profit: 0, orders: 0 };
      map[key].revenue += Number(o.finalTotal || o.total || o.grandTotal || 0); map[key].orders += 1;
    });
    filteredItems.forEach(i => {
      const o = filteredOrders.find((x: any) => x.id === i.orderId); if (!o) return;
      const d = String(o.createdAt || o.deliveryDate || o.orderDate || "").slice(0, 10);
      const key = periodKey(d);
      if (map[key]) map[key].profit += Number(i.profit || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredOrders, filteredItems, period]);

  const byCustomer = useMemo(() => {
    const map: Record<string, any> = {};
    filteredOrders.forEach(o => {
      const k = o.customerId || o.customerName || "Unknown";
      if (!map[k]) map[k] = { name: o.customerName || k, revenue: 0, profit: 0, orders: 0 };
      map[k].revenue += Number(o.finalTotal || o.total || o.grandTotal || 0); map[k].orders += 1;
    });
    filteredItems.forEach(i => {
      const o = filteredOrders.find((x: any) => x.id === i.orderId); if (!o) return;
      const k = o.customerId || o.customerName || "Unknown";
      if (map[k]) map[k].profit += Number(i.profit || 0);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, filteredItems]);

  const byProduct = useMemo(() => {
    const productMap: Record<string, string> = {};
    products.forEach(p => { productMap[p.id] = p.name || p.id; });
    const map: Record<string, any> = {};
    filteredItems.forEach(i => {
      const k = i.productId || i.productName || "Unknown";
      const resolvedName = productMap[i.productId] || i.productName || k;
      if (!map[k]) map[k] = { name: resolvedName, qty: 0, revenue: 0, profit: 0, customers: new Set() };
      const qty = Number(i.quantity || 0);
      const lineRevenue = Number(i.netLineTotal || i.lineNet || i.totalPrice || 0)
        || qty * Number(i.unitPrice || i.priceAtTime || 0);
      map[k].qty += qty;
      map[k].revenue += lineRevenue;
      map[k].profit += Number(i.profit || 0);
      const o = filteredOrders.find((x: any) => x.id === i.orderId);
      if (o?.customerName) map[k].customers.add(o.customerName);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, filteredOrders]);

  const unpaidInvoices = useMemo(() => invoices.filter(inv =>
    ["issued", "partly_paid", "overdue"].includes(inv.status)
  ), [invoices]);

  const totalUnpaid = useMemo(() => unpaidInvoices.reduce((s, inv) =>
    s + Math.max(Number(inv.finalTotal || 0) - Number(inv.paidAmount || 0), 0), 0
  ), [unpaidInvoices]);

  const stockData = useMemo(() => products.filter(p => p.active !== false).map(p => {
    const mv = movements.filter(m => m.productId === p.id);
    const inTotal = mv.filter(m => m.movementType === "In").reduce((s, m) => s + Number(m.quantity || 0), 0);
    const outTotal = mv.filter(m => m.movementType === "Out").reduce((s, m) => s + Number(m.quantity || 0), 0);
    const cur = Number(p.currentStock || 0);
    const min = Number(p.minStock || 0);
    return { ...p, inTotal, outTotal, currentStock: cur, minStock: min, outOfStock: cur <= 0, lowStock: cur <= min && min > 0 };
  }).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [products, movements]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /></div>;

  const DateFilter = () => (
    <div className="flex items-center gap-3">
      <div className="flex gap-2">
        {(["All", "B2B", "B2C"] as const).map(t => (
          <button key={t} onClick={() => setCustomerTypeFilter(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${customerTypeFilter === t ? "text-white" : "text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            style={customerTypeFilter === t ? {backgroundColor: "#1B2A5E"} : {}}>
            {t}
          </button>
        ))}
      </div>
      <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg" />
      <span className="text-gray-400 dark:text-gray-500 text-sm">to</span>
      <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg" />
      <button onClick={load} className="px-4 py-2 text-sm text-white rounded-lg font-medium" style={{backgroundColor: "#1B2A5E"}}>Refresh</button>
      <button onClick={() => setShowExport(true)}
        className="px-4 py-2 text-sm rounded-lg font-medium border border-red-500 text-red-500 bg-transparent hover:bg-red-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors">
        ↗ Export
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Reports</h1>
          <DateFilter />
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? "text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:text-white dark:border-gray-700"}`}
              style={tab === t ? {backgroundColor: "#1B2A5E"} : {}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {tab === "Sales" && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {label: "Revenue (period)", value: money(totalRevenue), valueColor: "text-gray-900 dark:text-white", sub: `${filteredOrders.length} ${filteredOrders.length === 1 ? "order" : "orders"}`},
              {label: "Profit (period)", value: money(totalProfit), valueColor: totalProfit > 0 ? "text-green-600 dark:text-green-400" : totalProfit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400", sub: totalRevenue > 0 ? pct(totalProfit/totalRevenue*100) + " margin" : "—"},
              {label: "Avg Order Value", value: money(filteredOrders.length ? totalRevenue/filteredOrders.length : 0), valueColor: "text-gray-900 dark:text-white", sub: "per order"},
              {label: "YTD Revenue", value: money(ytdRevenue), valueColor: "text-gray-900 dark:text-white", sub: new Date().getFullYear().toString()},
            ].map(c => (
              <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-bold ${c.valueColor}`}>{c.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {(["daily","weekly","monthly","yearly"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${period===p ? "text-white border-transparent" : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                style={period===p ? {backgroundColor:"#1B2A5E"} : {}}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {["Period","Orders","Revenue","Profit","Margin"].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${h==="Period" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {salesByPeriod.map(([key, data]) => (
                  <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 dark:border-gray-700">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{key}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{data.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(data.revenue)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${data.profit > 0 ? "text-green-600 dark:text-green-400" : data.profit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{money(data.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${data.revenue>0 && data.profit/data.revenue*100<15 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
                        {data.revenue>0 ? pct(data.profit/data.revenue*100) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {salesByPeriod.length===0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected period and filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>)}

        {tab === "Customers" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{byCustomer.length} customers · {money(totalRevenue)} total</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {["Customer","Orders","Revenue","Avg Order","Profit","Margin","% of Sales"].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${i===0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {byCustomer.map(c => (
                  <tr key={c.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{toTitleCase(c.name)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(c.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{money(c.orders ? c.revenue/c.orders : 0)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${c.profit > 0 ? "text-green-600 dark:text-green-400" : c.profit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{money(c.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${c.revenue>0 && c.profit/c.revenue*100<15 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
                        {c.revenue>0 ? pct(c.profit/c.revenue*100) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-xs">{totalRevenue>0 ? pct(c.revenue/totalRevenue*100) : "—"}</td>
                  </tr>
                ))}
                {byCustomer.length===0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected period and filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "Products" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{byProduct.length} products sold</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {["Product","Qty Sold","Revenue","Profit","Margin","Top Customers"].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${i===0||i===5 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {byProduct.map((p,i) => (
                  <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {i<3 && <span>{["🥇","🥈","🥉"][i]}</span>}
                        <span className="font-medium text-gray-900 dark:text-white">{toTitleCase(p.name)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{formatQty(p.qty)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(p.revenue)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${p.profit > 0 ? "text-green-600 dark:text-green-400" : p.profit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{money(p.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${p.revenue>0 && p.profit/p.revenue*100<15 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
                        {p.revenue>0 ? pct(p.profit/p.revenue*100) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{Array.from(p.customers as Set<string>).slice(0,3).join(", ")}</td>
                  </tr>
                ))}
                {byProduct.length===0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected period and filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "Profitability" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                {label:"Best Product", value:byProduct[0]?.name ? toTitleCase(byProduct[0].name) : "—", color:"text-gray-900 dark:text-white"},
                {label:"Total Profit", value:money(totalProfit), color: totalProfit > 0 ? "text-green-600 dark:text-green-400" : totalProfit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"},
                {label:"Overall Margin", value:totalRevenue>0?pct(totalProfit/totalRevenue*100):"—", color:totalRevenue>0&&totalProfit/totalRevenue*100<15?"text-yellow-600 dark:text-yellow-400":"text-green-600 dark:text-green-400"},
              ].map(c => (
                <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700"><p className="text-sm font-semibold text-gray-900 dark:text-white">Products by Profitability</p></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    {["Product","Revenue","Profit","Margin","Bar"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${i===0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {[...byProduct].sort((a,b) => (b.revenue>0?b.profit/b.revenue:0)-(a.revenue>0?a.profit/a.revenue:0)).map(p => {
                    const m = p.revenue>0?(p.profit/p.revenue)*100:0;
                    return (
                      <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{toTitleCase(p.name)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{money(p.revenue)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${p.profit > 0 ? "text-green-600 dark:text-green-400" : p.profit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{money(p.profit)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold ${m<0?"text-red-500 dark:text-red-400":m<15?"text-yellow-600 dark:text-yellow-400":"text-green-600 dark:text-green-400"}`}>{pct(m)}</span>
                        </td>
                        <td className="px-4 py-3 w-32">
                          <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                            <div className={`h-2 rounded-full ${m<0?"bg-red-400":m<15?"bg-yellow-400":"bg-green-500"}`}
                              style={{width:`${Math.min(Math.max(m,0),100)}%`}} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {byProduct.length===0 && (
                    <tr><td colSpan={5} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected period and filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Stock" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                {label:"In Stock", value:stockData.filter(p=>!p.outOfStock&&!p.lowStock).length, color:"text-green-600 dark:text-green-400"},
                {label:"Low Stock", value:stockData.filter(p=>p.lowStock&&!p.outOfStock).length, color:"text-yellow-600 dark:text-yellow-400"},
                {label:"Out of Stock", value:stockData.filter(p=>p.outOfStock).length, color:"text-red-500 dark:text-red-400"},
              ].map(c => (
                <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{c.label}</p>
                  <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    {["Product","Current Stock","Min Stock","Total In","Total Out","Status"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${i===0?"text-left":i===5?"text-center":"text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {stockData.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{toTitleCase(p.name)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatQty(p.currentStock)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{p.minStock||"—"}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatQty(p.inTotal)}</td>
                      <td className="px-4 py-3 text-right text-red-500 dark:text-red-400">{formatQty(p.outTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        {p.outOfStock ? <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">Out of Stock</span>
                          : p.lowStock ? <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full font-medium">⚠️ Low</span>
                          : <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">✓ OK</span>}
                      </td>
                    </tr>
                  ))}
                  {stockData.length===0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected period and filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Collections" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Outstanding</p>
                <p className="text-3xl font-bold text-red-500 dark:text-red-400">{money(totalUnpaid)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{unpaidInvoices.length} {unpaidInvoices.length === 1 ? "invoice" : "invoices"}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Overdue</p>
                <p className="text-3xl font-bold text-red-700 dark:text-red-400">{money(unpaidInvoices.filter(i=>i.status==="overdue").reduce((s,i)=>s+Math.max(Number(i.finalTotal||0)-Number(i.paidAmount||0),0),0))}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    {["Invoice","Customer","Date","Total","Paid","Balance","Status"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase ${i<3?"text-left":i===6?"text-center":"text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {unpaidInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer" onClick={() => window.location.href=`/invoices/${inv.id}`}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{inv.customerName}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{inv.invoiceDate}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(inv.finalTotal)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{money(inv.paidAmount||0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-500 dark:text-red-400">{money(Math.max(Number(inv.finalTotal||0)-Number(inv.paidAmount||0),0))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status==="overdue"?"bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400":"bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"}`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                  {unpaidInvoices.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">🎉 All invoices are paid!</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Export Report</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Select tabs to include · {customerTypeFilter !== "All" ? customerTypeFilter + " · " : ""}{fromDate} to {toDate}</p>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Include Tabs</p>
              <button
                onClick={() => {
                  const allSelected = ["Sales", "Customers", "Products", "Profitability", "Stock", "Collections"].every(t => exportTabs.includes(t));
                  setExportTabs(allSelected ? [] : ["Sales", "Customers", "Products", "Profitability", "Stock", "Collections"]);
                }}
                className="text-xs text-blue-500 dark:text-blue-400 hover:underline">
                {["Sales", "Customers", "Products", "Profitability", "Stock", "Collections"].every(t => exportTabs.includes(t)) ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {["Sales", "Customers", "Products", "Profitability", "Stock", "Collections"].map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={exportTabs.includes(t)}
                    onChange={e => setExportTabs(prev => e.target.checked ? [...prev, t] : prev.filter(x => x !== t))}
                    className="w-4 h-4 rounded accent-blue-600 dark:accent-blue-400 cursor-pointer" />
                  <span className="text-sm text-gray-700 dark:text-white">{t}</span>
                </label>
              ))}
            </div>

            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Download</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button disabled={exporting || exportTabs.length === 0}
                onClick={async () => {
                  setExporting(true);
                  try { exportToExcel({ salesByPeriod, byCustomer, byProduct, stockData, unpaidInvoices, totalRevenue, totalProfit, period, fromDate, toDate, customerTypeFilter }, exportTabs); }
                  finally { setExporting(false); }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 font-medium text-sm text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors">
                📊 Download Excel
              </button>
              <button disabled={exporting || exportTabs.length === 0}
                onClick={async () => {
                  setExporting(true);
                  try { await exportToPDF({ salesByPeriod, byCustomer, byProduct, stockData, unpaidInvoices, totalRevenue, totalProfit, period, fromDate, toDate, customerTypeFilter }, exportTabs); }
                  finally { setExporting(false); }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 font-medium text-sm text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors">
                📄 Download PDF
              </button>
            </div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Share</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button disabled={exporting || exportTabs.length === 0}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportToPDF({ salesByPeriod, byCustomer, byProduct, stockData, unpaidInvoices, totalRevenue, totalProfit, period, fromDate, toDate, customerTypeFilter }, exportTabs);
                    const totalOrders = salesByPeriod.reduce((s, [, d]) => s + d.orders, 0);
                    const url = buildWhatsAppReportShare({
                      dateFrom: fromDate,
                      dateTo: toDate,
                      type: customerTypeFilter,
                      revenue: totalRevenue,
                      profit: totalProfit,
                      margin: totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0,
                      orderCount: totalOrders,
                    });
                    window.open(url, "_blank");
                  } finally { setExporting(false); }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-colors">
                WhatsApp + PDF
              </button>
              <button disabled={exporting || exportTabs.length === 0}
                onClick={async () => {
                  setExporting(true);
                  try {
                    exportToExcel({ salesByPeriod, byCustomer, byProduct, stockData, unpaidInvoices, totalRevenue, totalProfit, period, fromDate, toDate, customerTypeFilter }, exportTabs);
                    const marginStr = totalRevenue > 0 ? (totalProfit/totalRevenue*100).toFixed(1) : "0";
                    const emailBody = [
                      "Hi,",
                      "",
                      "Please find attached the Di Peppi report for the period below.",
                      "",
                      "Report Summary",
                      "--------------",
                      "Period:   " + fromDate + " to " + toDate,
                      "Type:     " + customerTypeFilter,
                      "Orders:   " + filteredOrders.length,
                      "Revenue:  " + money(totalRevenue),
                      "Profit:   " + money(totalProfit),
                      "Margin:   " + marginStr + "%",
                      "",
                      "Tabs included: " + exportTabs.join(", "),
                      "",
                      "Best regards,",
                      "Di Peppi",
                    ].join("\n");
                    await navigator.clipboard.writeText(emailBody);
                    const subject = encodeURIComponent(`Di Peppi Report · ${customerTypeFilter} · ${fromDate} to ${toDate}`);
                    window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(emailBody)}`, "_blank");
                    showToast("Excel downloaded + email body copied to clipboard. Attach the Excel file manually.", "success");
                  } finally { setExporting(false); }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-40 transition-colors">
                ✉️ Email + Excel
              </button>
            </div>

            <button onClick={() => setShowExport(false)}
              className="w-full mt-3 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
