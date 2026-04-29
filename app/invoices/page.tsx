"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SearchInput from "@/components/SearchInput";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  customerName: string;
  customerType: string;
  finalTotal: number;
  currency: string;
  sourceOrderName: string;
  paymentMethod?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  draft:     { bg: "bg-gray-100 dark:bg-gray-700/60",    text: "text-gray-600 dark:text-gray-300",    dot: "bg-gray-400",   ring: "ring-gray-400" },
  issued:    { bg: "bg-blue-50 dark:bg-blue-900/30",     text: "text-blue-700 dark:text-blue-400",    dot: "bg-blue-400",   ring: "ring-blue-400" },
  paid:      { bg: "bg-green-50 dark:bg-green-900/30",   text: "text-green-700 dark:text-green-400",  dot: "bg-green-500",  ring: "ring-green-500" },
  overdue:   { bg: "bg-red-50 dark:bg-red-900/30",       text: "text-red-700 dark:text-red-400",      dot: "bg-red-500",    ring: "ring-red-500" },
  cancelled: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400",dot: "bg-orange-400", ring: "ring-orange-400" },
};

function money(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = typeof iso === "string" ? iso.split("T")[0] : "";
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

const DATE_RANGES = [
  { label: "All time",    value: "all" },
  { label: "This month",  value: "this_month" },
  { label: "Last month",  value: "last_month" },
  { label: "This year",   value: "this_year" },
];

function filterByDateRange(invoices: Invoice[], range: string): Invoice[] {
  if (range === "all") return invoices;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  return invoices.filter((inv) => {
    if (!inv.invoiceDate) return false;
    const d = new Date(inv.invoiceDate);
    if (range === "this_month") return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    if (range === "last_month") {
      const lm = thisMonth === 0 ? 11 : thisMonth - 1;
      const ly = thisMonth === 0 ? thisYear - 1 : thisYear;
      return d.getMonth() === lm && d.getFullYear() === ly;
    }
    if (range === "this_year") return d.getFullYear() === thisYear;
    return true;
  });
}

function EmptyIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="10" width="80" height="100" rx="6" fill="currentColor" className="text-gray-100 dark:text-gray-800" />
      <rect x="32" y="26" width="40" height="5" rx="2.5" fill="currentColor" className="text-gray-300 dark:text-gray-600" />
      <rect x="32" y="38" width="56" height="4" rx="2" fill="currentColor" className="text-gray-200 dark:text-gray-700" />
      <rect x="32" y="48" width="48" height="4" rx="2" fill="currentColor" className="text-gray-200 dark:text-gray-700" />
      <rect x="32" y="58" width="52" height="4" rx="2" fill="currentColor" className="text-gray-200 dark:text-gray-700" />
      <rect x="32" y="74" width="56" height="8" rx="4" fill="currentColor" className="text-gray-200 dark:text-gray-700" />
      <rect x="32" y="88" width="36" height="8" rx="4" fill="currentColor" className="text-gray-300 dark:text-gray-600" />
      <circle cx="88" cy="88" r="18" fill="#FEF2F2" />
      <path d="M88 80v8M88 92v1" stroke="#B5535A" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function InvoicesListPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Invoice[];

      const today = new Date().toISOString().slice(0, 10);
      const overdueUpdates: Promise<void>[] = [];
      data.forEach((inv) => {
        if (inv.status === "issued" && inv.dueDate && inv.dueDate < today) {
          inv.status = "overdue";
          overdueUpdates.push(updateDoc(doc(db, "invoices", inv.id), { status: "overdue" }));
        }
      });
      if (overdueUpdates.length > 0) await Promise.all(overdueUpdates);

      setInvoices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPay = async (e: React.MouseEvent, invId: string) => {
    e.stopPropagation();
    const method = prompt("Payment method? (Cash / Card / Transfer / Cheque / Other)", "Cash");
    if (!method) return;
    const date = new Date().toISOString().slice(0, 10);
    try {
      await updateDoc(doc(db, "invoices", invId), { status: "paid", paidAt: date, paymentMethod: method });
      await loadInvoices();
    } catch {
      alert("Error marking as paid");
    }
  };

  const handleQuickIssue = async (e: React.MouseEvent, invId: string) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "invoices", invId), { status: "issued" });
      await loadInvoices();
    } catch {
      alert("Error issuing invoice");
    }
  };

  const dateFiltered = useMemo(() => filterByDateRange(invoices, dateRange), [invoices, dateRange]);

  const countByStatus = (s: string) => dateFiltered.filter((i) => i.status === s).length;
  const totalByStatus = (s: string) =>
    dateFiltered.filter((i) => i.status === s).reduce((sum, i) => sum + (i.finalTotal || 0), 0);

  const outstandingTotal = dateFiltered
    .filter((i) => i.status === "issued" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.finalTotal || 0), 0);
  const overdueTotal = dateFiltered
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + (i.finalTotal || 0), 0);

  const filtered = dateFiltered.filter((inv) => {
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchSearch =
      !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      inv.sourceOrderName?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const hasActiveFilter = statusFilter !== "all" || search || dateRange !== "all";

  const today = new Date().toISOString().slice(0, 10);

  // Full empty state — no invoices exist at all
  if (!loading && invoices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Invoices</h1>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <EmptyIllustration />
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">No invoices yet</p>
            <p className="text-sm text-gray-400 mb-6">Create your first invoice from an order to get started.</p>
            <button
              onClick={() => router.push("/admin/orders")}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#B5535A" }}
            >
              Go to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>Invoices</h1>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {invoices.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 cursor-pointer"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {/* Search */}
          <div className="relative w-44">
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* KPI cards — 5 cards, all statuses */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {(["draft", "issued", "paid", "overdue", "cancelled"] as const).map((s) => {
            const style = STATUS_COLORS[s];
            const count = countByStatus(s);
            const total = totalByStatus(s);
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(isActive ? "all" : s)}
                className={`text-left bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none ${
                  isActive
                    ? `ring-2 border-transparent ${style.ring}`
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className={`text-xs font-medium ${style.text}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {isActive && (
                    <span className="ml-auto text-gray-300 dark:text-gray-600 text-xs leading-none">✕</span>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums text-gray-400 dark:text-gray-500">
                  {count}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{money(total)}</p>
              </button>
            );
          })}
        </div>

        {/* Outstanding banner */}
        {outstandingTotal > 0 && (
          <div className={`rounded-xl border px-4 py-3 mb-4 flex items-center justify-between ${
            overdueTotal > 0
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Total Outstanding</span>
              {overdueTotal > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">
                  {money(overdueTotal)} overdue
                </span>
              )}
            </div>
            <span className={`text-lg font-bold tabular-nums ${overdueTotal > 0 ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}`}>
              {money(outstandingTotal)}
            </span>
          </div>
        )}

        {/* Clear filters */}
        {hasActiveFilter && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => { setStatusFilter("all"); setSearch(""); setDateRange("all"); }}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-gray-400">No invoices match your filters</p>
              <button
                onClick={() => { setStatusFilter("all"); setSearch(""); setDateRange("all"); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((inv) => {
                  const style = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
                  const isOverdue = inv.status === "overdue";
                  const duePast = inv.dueDate && inv.dueDate < today && inv.status !== "paid" && inv.status !== "cancelled";
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push("/invoices/" + inv.id)}
                      className={`cursor-pointer transition-colors ${
                        isOverdue
                          ? "bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{inv.invoiceNumber || "—"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{inv.sourceOrderName || inv.id}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">{inv.customerName || "—"}</p>
                        <p className="text-xs text-gray-400">{inv.customerType}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(inv.invoiceDate)}</td>
                      <td className={`px-4 py-4 text-sm ${duePast ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                        {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {(inv.status || "draft").charAt(0).toUpperCase() + (inv.status || "draft").slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        <div className="flex items-center justify-end gap-3">
                          <span className="tabular-nums">{money(inv.finalTotal)}</span>
                          {inv.status === "draft" && (
                            <button
                              onClick={(e) => handleQuickIssue(e, inv.id)}
                              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors font-medium"
                            >
                              Issue
                            </button>
                          )}
                          {inv.status === "issued" && (
                            <button
                              onClick={(e) => handleQuickPay(e, inv.id)}
                              className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-medium"
                            >
                              Pay
                            </button>
                          )}
                          {inv.status === "overdue" && (
                            <button
                              onClick={(e) => handleQuickPay(e, inv.id)}
                              className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium"
                            >
                              Pay
                            </button>
                          )}
                          {inv.status === "paid" && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ {inv.paymentMethod}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
