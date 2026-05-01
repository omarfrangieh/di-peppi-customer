"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generatePOPDF } from "@/lib/generatePOPDF";
import { formatPrice } from "@/lib/formatters";
import { showToast } from "@/lib/toast";
import SearchInput from "@/components/SearchInput";
import { AlertTriangle } from "lucide-react";

const STATUSES = ["Generated", "Sent", "Delivered", "Paid", "Cancelled"];

function formatDate(iso: string): string {
  if (!iso) return "TBD";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const STATUS_COLORS: Record<string, string> = {
  Generated: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  Sent: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  Delivered: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  Paid: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Cancelled: "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400",
};

export default function PurchaseOrdersPage() {
  const [pos, setPOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [previewPO, setPreviewPO] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; poNumber: string; supplierName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, "purchaseOrders"), orderBy("createdAt", "desc")));
      } catch {
        snap = await getDocs(collection(db, "purchaseOrders"));
      }
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? (typeof a.createdAt === "string" ? new Date(a.createdAt).getTime() : 0);
          const tb = b.createdAt?.toMillis?.() ?? (typeof b.createdAt === "string" ? new Date(b.createdAt).getTime() : 0);
          return tb - ta;
        });
      setPOs(data);
    } catch (err) {
      console.error("Failed to load purchase orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await updateDoc(doc(db, "purchaseOrders", id), { status, updatedAt: new Date().toISOString() });
      setPOs(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } finally { setUpdating(null); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "purchaseOrders", deleteTarget.id));
      setPOs(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const shareViaPDF = async (po: any) => {
    if (!po.poContactPhone) { showToast("No PO contact phone found.", "warning"); return; }
    setSharing(po.id);
    try {
      const url = await generatePOPDF(po, "share");
      if (!url) { showToast("Failed to generate PDF.", "error"); return; }
      const phone = po.poContactPhone.replace(/[^0-9]/g, "");
      const msg = encodeURIComponent(
        `Hi ${po.poContactName || po.supplierName},\n\nPlease find our Purchase Order ${po.poNumber}.\nDelivery Date: ${po.deliveryDate || "TBD"}\n\nPO Total: ${formatPrice(po.poTotal)}\n\n📄 View PO: ${url}\n\nThank you,\nDi Peppi`
      );
      window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
      updateStatus(po.id, "Sent");
    } catch (e) {
      showToast("Error generating PDF.", "error");
      console.error(e);
    } finally {
      setSharing(null);
    }
  };

  const sendWhatsApp = (po: any) => {
    if (!po.poContactPhone) { showToast("No PO contact phone found.", "warning"); return; }
    const phone = po.poContactPhone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `Hi ${po.poContactName || po.supplierName},\n\nPlease find below our Purchase Order ${po.poNumber}.\n\nDelivery Date: ${po.deliveryDate || "TBD"}\n\nItems:\n${(po.items || []).map((i: any) => `- ${i.productName}: ${i.quantity} x ${formatPrice(i.unitCostPrice)} = ${formatPrice(i.lineTotal)}`).join("\n")}\n\nTotal: ${formatPrice(po.poTotal)}\n\nThank you,\nDi Peppi`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
    updateStatus(po.id, "Sent");
  };

  const filtered = pos.filter(p => {
    const matchSearch = (p.poNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.supplierName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const countByStatus = (s: string) => pos.filter(p => p.status === s).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-8 h-8 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Purchase Orders</h1>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{pos.length}</span>
        </div>
        <SearchInput placeholder="Search POs..." value={search} onChange={setSearch} className="w-48" />
      </div>

      <div className="max-w-5xl mx-auto px-6">

        {/* Status tab pills */}
        <div className="py-4 flex gap-2 overflow-x-auto pb-3">
          <button
            onClick={() => setFilterStatus("all")}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
              filterStatus === "all"
                ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            <span className="font-bold text-sm">{pos.length}</span>
            <span>All</span>
          </button>
          {STATUSES.map(s => {
            const count = countByStatus(s);
            const active = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(active ? "all" : s)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  count === 0 ? "opacity-50 pointer-events-none" : ""
                } ${
                  active
                    ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900"
                    : count === 0
                    ? "bg-white text-gray-300 border-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                }`}
              >
                <span className="font-bold text-sm">{count}</span>
                <span>{s}</span>
              </button>
            );
          })}
        </div>

        {/* PO cards */}
        <div className="space-y-3 pb-8">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
              No purchase orders yet. Create an invoice to auto-generate POs.
            </div>
          )}
          {filtered.map(po => (
            <div key={po.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Row 1 — main info */}
              <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-wrap min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{po.poNumber}</p>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🏭 {po.supplierName}</span>
                  {po.poDate && <span className="text-xs text-gray-400 dark:text-gray-500">PO: {formatDate(po.poDate)}</span>}
                  {po.deliveryDate && <span className="text-xs text-gray-400 dark:text-gray-500">Delivery: {formatDate(po.deliveryDate)}</span>}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white ml-auto">${formatPrice(po.poTotal)}</span>
              </div>

              {/* Row 2 — actions */}
              <div className="px-5 pb-4 flex items-center justify-end gap-2 flex-wrap border-t border-gray-100 dark:border-gray-700 pt-3">
                {/* PDF — primary filled */}
                <button onClick={() => generatePOPDF(po, "download")}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
                  style={{backgroundColor: "#1B2A5E"}}>
                  📄 PDF
                </button>

                {/* WhatsApp — outline green */}
                {po.poContactPhone && (
                  <button onClick={() => shareViaPDF(po)} disabled={sharing === po.id}
                    className="px-3 py-1.5 text-xs font-medium border border-green-600 dark:border-green-500 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors">
                    {sharing === po.id ? "Uploading..." : "📱 WhatsApp"}
                  </button>
                )}

                {/* Items toggle — ghost/outline */}
                <button onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Items {expanded === po.id ? "▲" : "▼"}
                </button>

                {/* Preview — ghost/outline */}
                <button onClick={() => setPreviewPO(po)}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Preview
                </button>

                {/* Status dropdown — ghost/outline */}
                <select value={po.status} onChange={e => updateStatus(po.id, e.target.value)}
                  disabled={updating === po.id}
                  className="text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none disabled:opacity-50 cursor-pointer">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>

                {/* Delete — text-only danger */}
                {po.status === "Generated" && (
                  <button onClick={() => setDeleteTarget({ id: po.id, poNumber: po.poNumber, supplierName: po.supplierName })}
                    className="px-2 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                    Delete
                  </button>
                )}
              </div>

              {/* Expanded items */}
              {expanded === po.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-900/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 dark:text-gray-500 uppercase text-left">
                        <th className="pb-2">Product</th>
                        <th className="pb-2 text-right">Qty</th>
                        <th className="pb-2 text-right">Unit Cost</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(po.items || []).map((item: any, i: number) => (
                        <tr key={i} className="text-gray-700 dark:text-gray-300">
                          <td className="py-1.5">
                            <div>{item.productName || item.productId}</div>
                            {item.preparation && <div className="text-xs text-blue-600 dark:text-blue-400">🔪 {item.preparation}</div>}
                            {item.weightNote && <div className="text-xs text-amber-600 dark:text-amber-400">⚖️ {item.weightNote}</div>}
                          </td>
                          <td className="py-1.5 text-right">{item.quantity}</td>
                          <td className="py-1.5 text-right">${formatPrice(item.unitCostPrice)}</td>
                          <td className="py-1.5 text-right font-medium">${formatPrice(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                        <td colSpan={3} className="pt-2 text-right text-gray-600 dark:text-gray-400">PO Total:</td>
                        <td className="pt-2 text-right text-gray-900 dark:text-white">${formatPrice(po.poTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Delete Confirmation Modal */}
    {deleteTarget && (
      <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
          <div className="flex flex-col items-center mb-4">
            <AlertTriangle className="text-red-500 dark:text-red-400 mb-3" size={32} strokeWidth={2} />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Purchase Order?</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{deleteTarget.poNumber}</span> for{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{deleteTarget.supplierName}</span> will be permanently removed.
          </p>
          <div className="flex gap-3">
            <button
              autoFocus
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Keep PO
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* PO Preview Modal */}
    {previewPO && (() => {
      const today = new Date().toISOString().slice(0, 10);
      const isDeliveryOverdue = previewPO.deliveryDate &&
        previewPO.deliveryDate < today &&
        !["Delivered", "Paid", "Cancelled"].includes(previewPO.status);
      const hasContact = previewPO.poContactName || previewPO.poContactPhone || previewPO.poContactEmail;
      const waMessage = encodeURIComponent(
        `Hi ${previewPO.supplierName}, please find attached PO #${previewPO.poNumber} for delivery on ${previewPO.deliveryDate ? formatDate(previewPO.deliveryDate) : "TBD"}. Total: $${formatPrice(previewPO.poTotal)}. Di Peppi`
      );
      return (
      <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{previewPO.poNumber}</h2>
            <button onClick={() => setPreviewPO(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl font-light">✕</button>
          </div>
          {/* Document paper area */}
          <div className="mx-4 my-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 px-6 py-5 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="h-12 w-12 object-contain mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Di Peppi — Your Gourmet Companion</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">+961 71 521714</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">PO #: <span className="font-semibold text-gray-900 dark:text-white">{previewPO.poNumber}</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400">PO Date: {formatDate(previewPO.poDate)}</p>
                <p className="text-xs font-semibold text-gray-900 dark:text-white">
                  Delivery: {previewPO.deliveryDate ? formatDate(previewPO.deliveryDate) : "TBD"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-b border-gray-200 dark:border-gray-600 py-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Supplier</p>
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{previewPO.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Contact</p>
                {hasContact ? (
                  <>
                    {previewPO.poContactName && <p className="text-sm text-gray-800 dark:text-gray-200">{previewPO.poContactName}</p>}
                    {previewPO.poContactPhone && <p className="text-xs text-gray-500 dark:text-gray-400">Tel: {previewPO.poContactPhone}</p>}
                    {previewPO.poContactEmail && <p className="text-xs text-gray-500 dark:text-gray-400">Email: {previewPO.poContactEmail}</p>}
                  </>
                ) : (
                  <a href="/admin/suppliers" className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2">
                    Add contact →
                  </a>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-white" style={{backgroundColor: "#1B2A5E"}}>
                  <th className="text-left px-3 py-2 rounded-tl-lg">Product</th>
                  <th className="text-center px-3 py-2">Qty</th>
                  <th className="text-center px-3 py-2">Unit Cost</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                {(previewPO.items || []).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white/60 dark:bg-gray-800/60" : "bg-transparent"}>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      <div>{item.productName || item.productId}</div>
                      {item.preparation && <div className="text-xs text-blue-600 dark:text-blue-400">🔪 {item.preparation}</div>}
                      {item.weightNote && <div className="text-xs text-amber-600 dark:text-amber-400">⚖️ {item.weightNote}</div>}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                      {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">${formatPrice(item.unitCostPrice)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">${formatPrice(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                  <td colSpan={3} className="px-3 pt-3 text-right font-bold text-gray-700 dark:text-gray-300">PO Total:</td>
                  <td className="px-3 pt-3 text-right font-bold text-lg" style={{color: "#1B2A5E"}}>${formatPrice(previewPO.poTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Footer buttons */}
          <div className="flex gap-2 px-4 pb-4">
            <a href={`https://wa.me/?text=${waMessage}`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-2 text-sm border border-green-600 text-green-700 dark:text-green-400 dark:border-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors font-medium">
              💬 WhatsApp
            </a>
            <button onClick={() => generatePOPDF(previewPO, "download")}
              className="flex-1 px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 font-medium"
              style={{backgroundColor: "#1B2A5E"}}>
              📄 Download PDF
            </button>
            <button onClick={() => setPreviewPO(null)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
              Close
            </button>
          </div>
        </div>
      </div>
      );
    })()}
    </>
  );
}
