"use client";

import React, { useEffect, useState } from "react";
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

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  draft:     { bg: "bg-gray-100",  text: "text-gray-600",  dot: "bg-gray-400" },
  issued:    { bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  paid:      { bg: "bg-green-50",  text: "text-green-700", dot: "bg-green-500" },
  overdue:   { bg: "bg-red-50",    text: "text-red-700",   dot: "bg-red-500" },
  cancelled: { bg: "bg-orange-50", text: "text-orange-700",dot: "bg-orange-400" },
};

function money(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}

const ALL_STATUSES = ["all", "draft", "issued", "paid", "overdue", "cancelled"];

export default function InvoicesListPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
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
      await updateDoc(doc(db, "invoices", invId), {
        status: "paid",
        paidAt: date,
        paymentMethod: method,
      });
      await loadInvoices();
    } catch (err) {
      alert("Error marking as paid");
    }
  };

  const filtered = invoices.filter((inv) => {
    const matchStatus = filter === "all" || inv.status === filter;
    const matchSearch =
      !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      inv.sourceOrderName?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalByStatus = (status: string) =>
    invoices.filter((i) => i.status === status).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Invoices</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {invoices.length}
          </span>
        </div>
        <SearchInput
          placeholder="Search invoices..."
          value={search}
          onChange={setSearch}
          className="w-56"
        />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {["draft", "issued", "paid", "overdue"].map((s) => {
            const style = STATUS_COLORS[s];
            const count = totalByStatus(s);
            const total = invoices
              .filter((i) => i.status === s)
              .reduce((sum, i) => sum + (i.finalTotal || 0), 0);
            return (
              <div
                key={s}
                onClick={() => setFilter(s === filter ? "all" : s)}
                className={`bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-400 transition-all ${filter === s ? "ring-2 ring-gray-900" : ""}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-xs font-medium ${style.text}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{money(total)}</p>
              </div>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== "all" && (
                <span className="ml-1.5 opacity-60">{totalByStatus(s)}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              No invoices found
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((inv) => {
                  const style = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push("/invoices/" + inv.id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{inv.invoiceNumber || "—"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{inv.sourceOrderName || inv.id}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900">{inv.customerName || "—"}</p>
                        <p className="text-xs text-gray-400">{inv.customerType}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{inv.invoiceDate || "—"}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {(inv.status || "draft").charAt(0).toUpperCase() + (inv.status || "draft").slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                        <div className="flex items-center justify-end gap-3">
                          <span>{money(inv.finalTotal)}</span>
                          {inv.status !== "paid" && (
                            <button
                              onClick={(e) => handleQuickPay(e, inv.id)}
                              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors font-medium"
                            >
                              Pay
                            </button>
                          )}
                          {inv.status === "paid" && (
                            <span className="text-xs text-green-600 font-medium">✓ {inv.paymentMethod}</span>
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
