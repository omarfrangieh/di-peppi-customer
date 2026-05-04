"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPrice } from "@/lib/formatters";

const STATUS_COLORS: Record<string, string> = {
  Draft:        "bg-gray-100 text-gray-600",
  Confirmed:    "bg-blue-100 text-blue-700",
  Preparing:    "bg-yellow-100 text-yellow-800",
  "To Deliver": "bg-orange-100 text-orange-700",
  Delivered:    "bg-green-100 text-green-800",
  Cancelled:    "bg-[#FAF0F0] text-[#B5535A]",
};

function formatDate(val: any) {
  if (!val) return "—";
  let d = val;
  if (val.toDate) d = val.toDate();
  else if (typeof val === "string") d = new Date(val);
  else if (typeof val === "number") d = new Date(val);
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function B2BOrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConfirmed = searchParams.get("confirmed") === "true";
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const raw = localStorage.getItem("b2b-session");
        if (!raw) { router.push("/b2b/login"); return; }

        const orderDoc = await getDoc(doc(db, "orders", params.id));
        if (!orderDoc.exists()) { router.push("/b2b/orders"); return; }
        setOrder({ id: orderDoc.id, ...orderDoc.data() });

        const itemsSnap = await getDocs(
          query(collection(db, "orderItems"), where("orderId", "==", params.id))
        );
        setItems(itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Confirmation banner */}
        {isConfirmed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 text-center">
            <p className="text-2xl mb-2">✅</p>
            <h2 className="font-bold text-green-800 text-lg mb-1">Order Submitted!</h2>
            <p className="text-green-700 text-sm">Your order <strong>{order.name}</strong> has been received and will be confirmed by our team shortly.</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push("/b2b/orders")} className="text-sm text-gray-500 hover:text-gray-700 font-medium mb-2 block">← All Orders</button>
            <h1 className="text-xl font-bold text-gray-900">{order.name}</h1>
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
            {order.status}
          </span>
        </div>

        <div className="space-y-5">
          {/* Summary card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide text-gray-500">Order Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-gray-400 mb-0.5">Company</p><p className="font-medium text-gray-900">{order.companyName || "—"}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Contact</p><p className="font-medium text-gray-900">{order.contactName || "—"}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="font-medium text-gray-900 text-xs">{order.email || "—"}</p></div>
              {order.vatNumber && <div><p className="text-xs text-gray-400 mb-0.5">VAT No.</p><p className="font-medium text-gray-900 font-mono text-xs">{order.vatNumber}</p></div>}
              {order.poReference && <div><p className="text-xs text-gray-400 mb-0.5">PO Reference</p><p className="font-medium text-gray-900 font-mono text-xs">{order.poReference}</p></div>}
              <div><p className="text-xs text-gray-400 mb-0.5">Payment</p><p className="font-medium text-gray-900 text-xs">{order.paymentMethod?.replace("_", " ")}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Delivery Date</p><p className="font-medium text-gray-900">{formatDate(order.deliveryDate)}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Placed</p><p className="font-medium text-gray-900">{formatDate(order.createdAt)}</p></div>
            </div>
            {order.deliveryAddress && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Delivery Address</p>
                <p className="text-sm text-gray-900">{order.deliveryAddress}</p>
              </div>
            )}
            {order.specialInstructions && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-0.5">Special Instructions</p>
                <p className="text-sm text-gray-900">{order.specialInstructions}</p>
              </div>
            )}
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">{items.length} Item{items.length !== 1 ? "s" : ""}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                      <p className="text-xs text-gray-500">{item.quantity} × ${formatPrice(item.priceAtTime)} / {item.unit}</p>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">${formatPrice(item.lineTotal || item.priceAtTime * item.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(order.total || 0)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/b2b/products")}
              className="flex-1 py-3 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              + Place Another Order
            </button>
            <button
              onClick={() => router.push("/b2b/orders")}
              className="flex-1 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              View All Orders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
