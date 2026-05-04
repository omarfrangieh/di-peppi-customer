"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
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

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("session");
    if (!raw) { router.push("/customer/login"); return; }
    const session = JSON.parse(raw);

    setLoading(true);

    // Merge results from multiple queries into a deduplicated sorted list
    const orderMap = new Map<string, any>();
    const flush = () => {
      const sorted = Array.from(orderMap.values()).sort((a: any, b: any) => {
        const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
        const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
        return tb.getTime() - ta.getTime();
      });
      setOrders(sorted);
      setLoading(false);
    };

    // Query 1: by customerId (primary — matches what checkout saved)
    const q1 = query(
      collection(db, "orders"),
      where("customerId", "==", session.userId)
    );
    const unsub1 = onSnapshot(q1, (snap) => {
      snap.docs.forEach(d => {
        const data = d.data();
        // Only show B2C orders
        if (data.source === "b2c") orderMap.set(d.id, { id: d.id, ...data });
      });
      flush();
    }, (err: any) => {
      setError(err.message || "Failed to load orders");
      setLoading(false);
    });

    // Query 2: by email (fallback — handles userId mismatch for email-login users)
    let unsub2: () => void = () => {};
    if (session.email) {
      const q2 = query(
        collection(db, "orders"),
        where("email", "==", session.email)
      );
      unsub2 = onSnapshot(q2, (snap) => {
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.source === "b2c") orderMap.set(d.id, { id: d.id, ...data });
        });
        flush();
      }, () => {});
    }

    // Query 3: by deliveryPhone (fallback — handles WhatsApp-login users with no email in session)
    let unsub3: () => void = () => {};
    if (session.phone) {
      const q3 = query(
        collection(db, "orders"),
        where("deliveryPhone", "==", session.phone)
      );
      unsub3 = onSnapshot(q3, (snap) => {
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.source === "b2c") orderMap.set(d.id, { id: d.id, ...data });
        });
        flush();
      }, () => {});
    }

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page title bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ color: "#B5535A", fontFamily: "var(--font-playfair)" }}>Order History</h1>
            <p className="text-xs text-gray-400 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            Shop
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

        {error && (
          <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: "#FAF0F0", border: "1px solid #B5535A33" }}>
            <p className="text-sm" style={{ color: "#B5535A" }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
            <p className="text-4xl mb-4">📦</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-sm text-gray-500 mb-6">Start shopping to place your first order!</p>
            <button onClick={() => router.push("/customer/products")} className="px-6 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90 cursor-pointer" style={{ backgroundColor: "#1B2A5E" }}>
              Browse Products
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900 text-sm">{order.name || order.id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Delivery: {formatDate(order.deliveryDate)} · {order.itemCount || "?"} item{(order.itemCount || 0) !== 1 ? "s" : ""}
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
