"use client";
import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

function money(v: number) { return "$" + Number(v || 0).toFixed(2); }
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
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10));
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"All" | "B2B" | "B2C">("All");

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
    const d = o.deliveryDate || o.orderDate || "";
    const matchDate = d >= fromDate && d <= toDate && o.status !== "Cancelled";
    const matchType = customerTypeFilter === "All" || o.customerType === customerTypeFilter;
    return matchDate && matchType;
  }), [orders, fromDate, toDate, customerTypeFilter]);

  const filteredItems = useMemo(() => {
    const ids = new Set(filteredOrders.map((o: any) => o.id));
    return items.filter(i => ids.has(i.orderId));
  }, [items, filteredOrders]);

  const totalRevenue = useMemo(() => filteredOrders.reduce((s, o) => s + Number(o.finalTotal || 0), 0), [filteredOrders]);
  const totalProfit = useMemo(() => filteredItems.reduce((s, i) => s + Number(i.profit || 0), 0), [filteredItems]);
  const ytdRevenue = useMemo(() => orders.filter(o => {
    const d = o.deliveryDate || o.orderDate || "";
    return d >= `${new Date().getFullYear()}-01-01` && o.status !== "Cancelled";
  }).reduce((s, o) => s + Number(o.finalTotal || 0), 0), [orders]);

  const salesByPeriod = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; orders: number }> = {};
    filteredOrders.forEach(o => {
      const d = o.deliveryDate || o.orderDate || ""; if (!d) return;
      let key = period === "daily" ? d : period === "monthly" ? d.slice(0, 7) : (() => {
        const dt = new Date(d); const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10);
      })();
      if (!map[key]) map[key] = { revenue: 0, profit: 0, orders: 0 };
      map[key].revenue += Number(o.finalTotal || 0); map[key].orders += 1;
    });
    filteredItems.forEach(i => {
      const o = filteredOrders.find((x: any) => x.id === i.orderId); if (!o) return;
      const d = o.deliveryDate || o.orderDate || "";
      let key = period === "daily" ? d : period === "monthly" ? d.slice(0, 7) : (() => {
        const dt = new Date(d); const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10);
      })();
      if (map[key]) map[key].profit += Number(i.profit || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredOrders, filteredItems, period]);

  const byCustomer = useMemo(() => {
    const map: Record<string, any> = {};
    filteredOrders.forEach(o => {
      const k = o.customerId || o.customerName || "Unknown";
      if (!map[k]) map[k] = { name: o.customerName || k, revenue: 0, profit: 0, orders: 0 };
      map[k].revenue += Number(o.finalTotal || 0); map[k].orders += 1;
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
      const resolvedName = i.productName || productMap[i.productId] || k;
      if (!map[k]) map[k] = { name: resolvedName, qty: 0, revenue: 0, profit: 0, customers: new Set() };
      map[k].qty += Number(i.quantity || 0);
      map[k].revenue += Number(i.netLineTotal || i.lineNet || i.totalPrice || 0);
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

  const stockData = useMemo(() => products.map(p => {
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
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        {(["All", "B2B", "B2C"] as const).map(t => (
          <button key={t} onClick={() => setCustomerTypeFilter(t)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${customerTypeFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t}
          </button>
        ))}
      </div>
      <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
      <span className="text-gray-400 text-sm">to</span>
      <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
      <button onClick={load} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700">Refresh</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Reports</h1>
          <DateFilter />
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t ? "text-white" : "text-gray-500 hover:bg-gray-100"}`}
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
              {label: "Revenue (period)", value: money(totalRevenue), sub: `${filteredOrders.length} orders`},
              {label: "Profit (period)", value: money(totalProfit), sub: totalRevenue > 0 ? pct(totalProfit/totalRevenue*100) + " margin" : "—"},
              {label: "Avg Order Value", value: money(filteredOrders.length ? totalRevenue/filteredOrders.length : 0), sub: "per order"},
              {label: "YTD Revenue", value: money(ytdRevenue), sub: new Date().getFullYear().toString()},
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {(["daily","weekly","monthly"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${period===p ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                style={period===p ? {backgroundColor:"#1B2A5E"} : {}}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Period","Orders","Revenue","Profit","Margin"].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${h==="Period" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesByPeriod.map(([key, data]) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{key}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{data.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(data.revenue)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{money(data.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${data.revenue>0 && data.profit/data.revenue*100<15 ? "text-yellow-600" : "text-green-600"}`}>
                        {data.revenue>0 ? pct(data.profit/data.revenue*100) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {salesByPeriod.length===0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No data for this period</td></tr>}
              </tbody>
            </table>
          </div>
        </>)}

        {tab === "Customers" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-900">{byCustomer.length} customers · {money(totalRevenue)} total</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Customer","Orders","Revenue","Avg Order","Profit","Margin","% of Sales"].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i===0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byCustomer.map(c => (
                  <tr key={c.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{c.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(c.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{money(c.orders ? c.revenue/c.orders : 0)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{money(c.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${c.revenue>0 && c.profit/c.revenue*100<15 ? "text-yellow-600" : "text-green-600"}`}>
                        {c.revenue>0 ? pct(c.profit/c.revenue*100) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{totalRevenue>0 ? pct(c.revenue/totalRevenue*100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "Products" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-900">{byProduct.length} products sold</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Product","Qty Sold","Revenue","Profit","Margin","Top Customers"].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i===0||i===5 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byProduct.map((p,i) => (
                  <tr key={p.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {i<3 && <span>{["🥇","🥈","🥉"][i]}</span>}
                        <span className="font-medium text-gray-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(p.qty).toFixed(2).replace(/\.?0+$/,"")}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(p.revenue)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{money(p.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${p.revenue>0 && p.profit/p.revenue*100<15 ? "text-yellow-600" : "text-green-600"}`}>
                        {p.revenue>0 ? pct(p.profit/p.revenue*100) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{Array.from(p.customers as Set<string>).slice(0,3).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "Profitability" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                {label:"Total Profit", value:money(totalProfit), color:"text-green-600"},
                {label:"Overall Margin", value:totalRevenue>0?pct(totalProfit/totalRevenue*100):"—", color:totalRevenue>0&&totalProfit/totalRevenue*100<15?"text-yellow-600":"text-green-600"},
                {label:"Best Product", value:byProduct[0]?.name||"—", color:"text-gray-900"},
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Products by Profitability</p></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Product","Revenue","Profit","Margin","Bar"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i===0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...byProduct].sort((a,b) => (b.revenue>0?b.profit/b.revenue:0)-(a.revenue>0?a.profit/a.revenue:0)).map(p => {
                    const m = p.revenue>0?(p.profit/p.revenue)*100:0;
                    return (
                      <tr key={p.name} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{money(p.revenue)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{money(p.profit)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold ${m<0?"text-red-500":m<15?"text-yellow-600":"text-green-600"}`}>{pct(m)}</span>
                        </td>
                        <td className="px-4 py-3 w-32">
                          <div className="bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${m<0?"bg-red-400":m<15?"bg-yellow-400":"bg-green-500"}`}
                              style={{width:`${Math.min(Math.max(m,0),100)}%`}} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Stock" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                {label:"In Stock", value:stockData.filter(p=>!p.outOfStock&&!p.lowStock).length, color:"text-green-600"},
                {label:"Low Stock", value:stockData.filter(p=>p.lowStock&&!p.outOfStock).length, color:"text-yellow-600"},
                {label:"Out of Stock", value:stockData.filter(p=>p.outOfStock).length, color:"text-red-500"},
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Product","Current Stock","Min Stock","Total In","Total Out","Status"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i===0?"text-left":i===5?"text-center":"text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockData.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-right font-semibold">{Number(p.currentStock).toFixed(3).replace(/\.?0+$/,"")}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{p.minStock||"—"}</td>
                      <td className="px-4 py-3 text-right text-green-600">{Number(p.inTotal).toFixed(2).replace(/\.?0+$/,"")}</td>
                      <td className="px-4 py-3 text-right text-red-500">{Number(p.outTotal).toFixed(2).replace(/\.?0+$/,"")}</td>
                      <td className="px-4 py-3 text-center">
                        {p.outOfStock ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Out of Stock</span>
                          : p.lowStock ? <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">⚠️ Low</span>
                          : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Collections" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">Total Outstanding</p>
                <p className="text-3xl font-bold text-red-500">{money(totalUnpaid)}</p>
                <p className="text-xs text-gray-400 mt-1">{unpaidInvoices.length} invoices</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">Overdue</p>
                <p className="text-3xl font-bold text-red-700">{money(unpaidInvoices.filter(i=>i.status==="overdue").reduce((s,i)=>s+Math.max(Number(i.finalTotal||0)-Number(i.paidAmount||0),0),0))}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Invoice","Customer","Date","Total","Paid","Balance","Status"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i<3?"text-left":i===6?"text-center":"text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unpaidInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href=`/invoices/${inv.id}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{inv.customerName}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.invoiceDate}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(inv.finalTotal)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{money(inv.paidAmount||0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-500">{money(Math.max(Number(inv.finalTotal||0)-Number(inv.paidAmount||0),0))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status==="overdue"?"bg-red-100 text-red-600":"bg-blue-50 text-blue-600"}`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                  {unpaidInvoices.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">🎉 All invoices are paid!</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
