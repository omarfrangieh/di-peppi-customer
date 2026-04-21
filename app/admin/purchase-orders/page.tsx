"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generatePOPDF } from "@/lib/generatePOPDF";
import { formatPrice, formatQty } from "@/lib/formatters";
import SearchInput from "@/components/SearchInput";

const STATUSES = ["Generated", "Sent", "Delivered", "Paid", "Cancelled"];

function formatDate(iso: string): string {
  if (!iso) return "TBD";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const STATUS_COLORS: Record<string, string> = {
  Generated: "bg-gray-100 text-gray-600",
  Sent: "bg-blue-50 text-blue-600",
  Delivered: "bg-green-50 text-green-600",
  Paid: "bg-purple-50 text-purple-700",
  Cancelled: "bg-red-50 text-red-500",
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

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "purchaseOrders"), orderBy("createdAt", "desc")));
      setPOs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const deletePO = async (id: string, poNumber: string) => {
    if (!confirm("Delete " + poNumber + "? This cannot be undone.")) return;
    await deleteDoc(doc(db, "purchaseOrders", id));
    setPOs(prev => prev.filter(p => p.id !== id));
  };

  const shareViaPDF = async (po: any) => {
    if (!po.poContactPhone) { alert("No PO contact phone found."); return; }
    setSharing(po.id);
    try {
      const url = await generatePOPDF(po, "share");
      if (!url) { alert("Failed to generate PDF."); return; }
      const phone = po.poContactPhone.replace(/[^0-9]/g, "");
      const msg = encodeURIComponent(
        `Hi ${po.poContactName || po.supplierName},

Please find our Purchase Order ${po.poNumber}.
Delivery Date: ${po.deliveryDate || "TBD"}

PO Total: ${formatPrice(po.poTotal)}

📄 View PO: ${url}

Thank you,
Di Peppi`
      );
      window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
      updateStatus(po.id, "Sent");
    } catch (e) {
      alert("Error generating PDF.");
      console.error(e);
    } finally {
      setSharing(null);
    }
  };

  const sendWhatsApp = (po: any) => {
    if (!po.poContactPhone) { alert("No PO contact phone found."); return; }
    const phone = po.poContactPhone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `Hi ${po.poContactName || po.supplierName},\n\nPlease find below our Purchase Order ${po.poNumber}.\n\nDelivery Date: ${po.deliveryDate || "TBD"}\n\nItems:\n${(po.items || []).map((i: any) => `- ${i.productName}: ${i.quantity} x ${formatPrice(i.unitCostPrice)} = ${formatPrice(i.lineTotal)}`).join("\n")}\n\nTotal: ${formatPrice(po.poTotal)}\n\nThank you,\nDi Peppi`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
    updateStatus(po.id, "Sent");
  };

  const sendEmail = (po: any) => {
    if (!po.poContactEmail) { alert("No PO contact email found."); return; }
    const subject = encodeURIComponent(`Purchase Order ${po.poNumber} - Di Peppi`);
    const body = encodeURIComponent(
      `Hi ${po.poContactName || po.supplierName},\n\nPlease find below our Purchase Order ${po.poNumber}.\n\nDelivery Date: ${po.deliveryDate || "TBD"}\n\nItems:\n${(po.items || []).map((i: any) => `- ${i.productName}: ${i.quantity} x ${formatPrice(i.unitCostPrice)} = ${formatPrice(i.lineTotal)}`).join("\n")}\n\nTotal: ${formatPrice(po.poTotal)}\n\nThank you,\nDi Peppi`
    );
    window.open(`mailto:${po.poContactEmail}?subject=${subject}&body=${body}`, "_blank");
    updateStatus(po.id, "Sent");
  };

  const filtered = pos.filter(p => {
    const matchSearch = (p.poNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.supplierName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Purchase Orders</h1>
          <span className="text-xs text-gray-400">{pos.length} POs</span>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none">
            <option value="all">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <SearchInput
            placeholder="Search POs..."
            value={search}
            onChange={setSearch}
            className="w-48"
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">
            No purchase orders yet. Create an invoice to auto-generate POs.
          </div>
        )}
        {filtered.map(po => (
          <div key={po.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-semibold text-gray-900">{po.poNumber}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[po.status] || "bg-gray-100 text-gray-600"}`}>
                    {po.status}
                  </span>
                  <span className="text-xs text-gray-500">🏭 {po.supplierName}</span>
                  {po.poDate && <span className="text-xs text-gray-400">PO Date: {formatDate(po.poDate)}</span>}
                  {po.deliveryDate && <span className="text-xs text-gray-400">Delivery: {formatDate(po.deliveryDate)}</span>}
                  <span className="text-xs font-medium text-gray-700">${formatPrice(po.poTotal)}</span>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => generatePOPDF(po, "download")}
                    className="px-3 py-1.5 text-xs bg-[#1B2A5E] text-white rounded-lg hover:bg-[#152248]">
                    📄 PDF
                  </button>
                  {po.poContactPhone && (
                    <button onClick={() => shareViaPDF(po)}
                      disabled={sharing === po.id}
                      className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                      {sharing === po.id ? "Uploading..." : "📱 WhatsApp PDF"}
                    </button>
                  )}
                  {po.poContactEmail && (
                    <button onClick={() => sendEmail(po)}
                      className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                      ✉️ Email
                    </button>
                  )}
                  <select value={po.status} onChange={e => updateStatus(po.id, e.target.value)}
                    disabled={updating === po.id}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button onClick={() => setPreviewPO(po)}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                    Preview
                  </button>
                  {po.status === "Generated" && (
                    <button onClick={() => deletePO(po.id, po.poNumber)}
                      className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {po.poContactName && (
                <p className="text-xs text-gray-400 mt-1">
                  Contact: {po.poContactName}
                  {po.poContactPhone && ` · 📞 ${po.poContactPhone}`}
                  {po.poContactEmail && ` · ✉️ ${po.poContactEmail}`}
                </p>
              )}
            </div>

            {expanded === po.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase text-left">
                      <th className="pb-2">Product</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Total</th>

                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(po.items || []).map((item: any, i: number) => (
                      <tr key={i} className="text-gray-700">
                        <td className="py-1.5">
                          <div>{item.productName || item.productId}</div>
                          {item.preparation && <div className="text-xs text-blue-600">🔪 {item.preparation}</div>}
                          {item.weightNote && <div className="text-xs text-amber-600">⚖️ {item.weightNote}</div>}
                        </td>
                        <td className="py-1.5 text-right">{item.quantity}</td>
                        <td className="py-1.5 text-right">${formatPrice(item.unitCostPrice)}</td>
                        <td className="py-1.5 text-right font-medium">${formatPrice(item.lineTotal)}</td>

                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 font-semibold">
                      <td colSpan={3} className="pt-2 text-right text-gray-600">PO Total:</td>
                      <td className="pt-2 text-right">${formatPrice(po.poTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>

    {/* PO Preview Modal */}
    {previewPO && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{previewPO.poNumber}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[previewPO.status] || "bg-gray-100 text-gray-600"}`}>
                {previewPO.status}
              </span>
            </div>
            <button onClick={() => setPreviewPO(null)}
              className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Di Peppi + PO info */}
            <div className="flex justify-between items-start">
              <div>
                <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="h-12 w-12 object-contain mb-2" />
                <p className="text-xs text-gray-500">Di Peppi — Your Gourmet Companion</p>
                <p className="text-xs text-gray-500">+961 71 521714</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-xs text-gray-500">PO #: <span className="font-semibold text-gray-900">{previewPO.poNumber}</span></p>
                <p className="text-xs text-gray-500">PO Date: {formatDate(previewPO.poDate)}</p>
                <p className="text-xs font-bold" style={{color: "#B5535A"}}>
                  Delivery: {previewPO.deliveryDate ? formatDate(previewPO.deliveryDate) : "TBD"}
                </p>
              </div>
            </div>

            {/* Supplier + Contact */}
            <div className="grid grid-cols-2 gap-4 border-t border-b border-gray-100 py-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Supplier</p>
                <p className="font-semibold text-sm" style={{color: "#B5535A"}}>{previewPO.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contact</p>
                <p className="text-sm text-gray-800">{previewPO.poContactName || "—"}</p>
                {previewPO.poContactPhone && <p className="text-xs text-gray-500">Tel: {previewPO.poContactPhone}</p>}
                {previewPO.poContactEmail && <p className="text-xs text-gray-500">Email: {previewPO.poContactEmail}</p>}
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-white" style={{backgroundColor: "#1B2A5E"}}>
                  <th className="text-left px-3 py-2 rounded-tl-lg">Product</th>
                  <th className="text-center px-3 py-2">Qty</th>
                  <th className="text-center px-3 py-2">Unit Cost</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(previewPO.items || []).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                    <td className="px-3 py-2 text-gray-800">
                      <div>{item.productName || item.productId}</div>
                      {item.preparation && <div className="text-xs text-blue-600">🔪 {item.preparation}</div>}
                      {item.weightNote && <div className="text-xs text-amber-600">⚖️ {item.weightNote}</div>}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-2 text-center text-gray-600">${formatPrice(item.unitCostPrice)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">${formatPrice(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="px-3 pt-3 text-right font-bold text-gray-700">PO Total:</td>
                  <td className="px-3 pt-3 text-right font-bold text-lg" style={{color: "#1B2A5E"}}>${formatPrice(previewPO.poTotal)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => { generatePOPDF(previewPO, "download"); }}
                className="flex-1 px-3 py-2 text-sm bg-[#1B2A5E] text-white rounded-lg hover:bg-[#152248]">
                📄 Download PDF
              </button>
              {previewPO.poContactPhone && (
                <button onClick={() => { shareViaPDF(previewPO); }}
                  disabled={sharing === previewPO.id}
                  className="flex-1 px-3 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                  {sharing === previewPO.id ? "Uploading..." : "📱 WhatsApp PDF"}
                </button>
              )}
              <button onClick={() => setPreviewPO(null)}
                className="px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
