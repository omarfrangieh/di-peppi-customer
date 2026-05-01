"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPrice } from "@/lib/formatters";

const STATUS_COLORS: Record<string, string> = {
  Draft:        "bg-gray-100 text-gray-600",
  Confirmed:    "bg-blue-100 text-blue-700",
  Preparing:    "bg-yellow-100 text-yellow-800",
  "To Deliver": "bg-orange-100 text-orange-700",
  Delivered:    "bg-green-100 text-green-800",
  Cancelled:    "bg-red-100 text-red-700",
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

export default function B2BOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const raw = localStorage.getItem("b2b-session");
        if (!raw) { router.push("/b2b/login"); return; }
        const session = JSON.parse(raw);

        const q = query(
          collection(db, "orders"),
          where("customerId", "==", session.userId),
          where("source", "==", "b2b")
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort by createdAt desc client-side
        data.sort((a: any, b: any) => {
          const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
          const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
          return tb.getTime() - ta.getTime();
        });
        setOrders(data);
      } catch (err: any) {
        setError(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Order History</h1>
            <p className="text-sm text-gray-500 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""} placed</p>
          </div>
          <button
            onClick={() => router.push("/b2b/products")}
            className="px-4 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            + New Order
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
            <p className="text-4xl mb-4">📦</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-sm text-gray-500 mb-6">Your submitted orders will appear here</p>
            <button
              onClick={() => router.push("/b2b/products")}
              className="px-6 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Browse Catalogue
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => router.push(`/b2b/orders/${order.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900 text-sm">{order.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                      {order.status}
                    </span>
                    {order.poReference && (
                      <span className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded">
                        PO: {order.poReference}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Delivery: {formatDate(order.deliveryDate)} · {order.itemCount || "?"} item{(order.itemCount || 0) !== 1 ? "s" : ""} · {order.paymentMethod?.replace("_", " ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">${formatPrice(order.total || 0)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.createdAt)}</p>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
