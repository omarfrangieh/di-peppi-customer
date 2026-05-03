"use client";

import { use, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  doc, getDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp,
} from "firebase/firestore";
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

const CANCEL_WINDOW_SECS = 10;

export default function CustomerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConfirmed = searchParams.get("confirmed") === "true";

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancel state
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 10-second cancel window based on actual order.createdAt timestamp
  useEffect(() => {
    if (!order || order.status !== "Draft") return;

    // Resolve createdAt to a JS timestamp
    let createdMs: number | null = null;
    const raw = order.createdAt;
    if (raw) {
      if (typeof raw.toMillis === "function") createdMs = raw.toMillis();
      else if (raw.seconds) createdMs = raw.seconds * 1000;
      else if (typeof raw === "string") createdMs = new Date(raw).getTime();
      else if (typeof raw === "number") createdMs = raw;
    }
    if (!createdMs) return;

    const secsLeft = () =>
      Math.max(0, CANCEL_WINDOW_SECS - Math.floor((Date.now() - createdMs!) / 1000));

    const initial = secsLeft();
    if (initial <= 0) return;

    setCountdown(initial);
    timerRef.current = setInterval(() => {
      const left = secsLeft();
      setCountdown(left > 0 ? left : null);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 500);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status, order?.createdAt]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const raw = localStorage.getItem("session");
        if (!raw) { router.push("/customer/login"); return; }

        const orderDoc = await getDoc(doc(db, "orders", id));
        if (!orderDoc.exists()) { router.push("/customer/orders"); return; }
        setOrder({ id: orderDoc.id, ...orderDoc.data() });

        const itemsSnap = await getDocs(
          query(collection(db, "orderItems"), where("orderId", "==", id))
        );
        setItems(itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, router]);

  const handleCancel = async () => {
    if (!order) return;
    // Re-fetch to guard against race (e.g. admin confirmed while timer was running)
    const fresh = await getDoc(doc(db, "orders", id));
    if (!fresh.exists() || fresh.data()?.status !== "Draft") {
      setCancelError("This order can no longer be cancelled — it has already been processed.");
      setShowConfirm(false);
      setOrder((prev: any) => fresh.exists() ? { ...prev, ...fresh.data() } : prev);
      return;
    }

    setCancelling(true);
    setCancelError(null);
    try {
      const withinWindow = countdown !== null && countdown > 0;
      const orderTotal = order.total || order.finalTotal || order.grandTotal || 0;

      // TODO: when online/card payments are enabled, add payment gateway refund here
      // e.g. if (order.paymentMethod === "online" && order.paymentIntentId) {
      //   await callStripeRefund(order.paymentIntentId, orderTotal);
      // }

      // Wallet refund first (applies whether we delete or cancel)
      if (order.paymentMethod === "wallet" && orderTotal > 0 && order.customerId) {
        try {
          const custSnap = await getDoc(doc(db, "customers", order.customerId));
          if (custSnap.exists()) {
            const currentBalance = custSnap.data().walletBalance || 0;
            await updateDoc(doc(db, "customers", order.customerId), {
              walletBalance: currentBalance + orderTotal,
            });
            await addDoc(collection(db, "walletTransactions"), {
              customerId: order.customerId,
              orderId: id,
              amount: orderTotal,
              type: "credit",
              description: `Refund for cancelled order ${order.name || id}`,
              createdAt: serverTimestamp(),
            });
          }
        } catch (refundErr) {
          console.error("Wallet refund failed:", refundErr);
        }
      }

      if (withinWindow) {
        // Within 10-second window: delete the order entirely so it never appears in admin
        await deleteDoc(doc(db, "orders", id));
      } else {
        // After window: mark as Cancelled so admin can see the history
        await updateDoc(doc(db, "orders", id), {
          status: "Cancelled",
          cancelledAt: serverTimestamp(),
          cancelledBy: "customer",
          updatedAt: serverTimestamp(),
        });
      }

      // Stop the countdown
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(null);
      setShowConfirm(false);

      if (withinWindow) {
        // Order was deleted — go straight back to orders list
        router.replace("/customer/orders");
      } else {
        setOrder((prev: any) => prev ? { ...prev, status: "Cancelled" } : prev);
      }
    } catch (err: any) {
      setCancelError(err.message || "Failed to cancel order. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!order) return null;

  // Only allow cancel within the 10-second window
  const canCancel = order.status === "Draft" && countdown !== null && countdown > 0;
  const orderTotal = order.total || order.finalTotal || order.grandTotal || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Post-checkout / fresh order banner — shown while cancel window is open */}
        {canCancel && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xl">✅</p>
                  <h2 className="font-bold text-green-800 text-base">Order Placed!</h2>
                </div>
                <p className="text-green-700 text-sm">
                  Your order <strong>{order.name}</strong> has been received. We'll confirm it shortly.
                </p>
              </div>
              <button
                onClick={() => setShowConfirm(true)}
                className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold flex items-center justify-center">
                  {countdown}
                </span>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {order.status === "Cancelled" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-lg mb-1">❌</p>
            <p className="font-semibold text-red-800 text-sm">Order Cancelled</p>
            {order.paymentMethod === "wallet" && (
              <p className="text-xs text-red-600 mt-1">
                ${formatPrice(orderTotal)} has been refunded to your wallet.
              </p>
            )}
          </div>
        )}

        {/* Cancel error */}
        {cancelError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-red-700 text-sm">{cancelError}</p>
          </div>
        )}

        {/* Cancel confirmation dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <h3 className="font-bold text-gray-900 text-lg mb-1">Cancel this order?</h3>
              <p className="text-sm text-gray-500 mb-1">
                Order <strong>{order.name}</strong> will be cancelled.
              </p>
              {order.paymentMethod === "wallet" && orderTotal > 0 && (
                <p className="text-sm text-green-700 font-medium mb-4">
                  💰 ${formatPrice(orderTotal)} will be refunded to your wallet.
                </p>
              )}
              {!order.paymentMethod?.includes("wallet") && <div className="mb-4" />}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={cancelling}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 bg-red-500 text-white font-semibold rounded-xl text-sm hover:bg-red-600 cursor-pointer disabled:opacity-60"
                >
                  {cancelling ? "Cancelling…" : "Yes, Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#B5535A" }}>{order.name}</h1>
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
            {order.status}
          </span>
        </div>

        <div className="space-y-4">
          {/* Order info */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Order Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-400 mb-0.5">Delivery Date</p><p className="font-medium text-gray-900">{formatDate(order.deliveryDate)}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Payment</p><p className="font-medium text-gray-900 capitalize">{order.paymentMethod}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Placed</p><p className="font-medium text-gray-900">{formatDate(order.createdAt)}</p></div>
              {order.deliveryPhone && <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="font-medium text-gray-900">{order.deliveryPhone}</p></div>}
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
                      <p className="text-xs text-gray-500">{item.quantity} × ${formatPrice(item.priceAtTime || item.unitPrice || 0)}</p>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">${formatPrice(item.lineTotal || item.priceAtTime * item.quantity || 0)}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
                <span className="font-bold text-gray-900 text-sm">Total</span>
                <span className="text-xl font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(orderTotal)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => router.push("/customer/products")} className="flex-1 py-3 text-white font-semibold rounded-xl text-sm hover:opacity-90 cursor-pointer" style={{ backgroundColor: "#1B2A5E" }}>
              Shop
            </button>
            <button onClick={() => router.push("/customer/orders")} className="flex-1 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer">
              All Orders
            </button>
          </div>

          {/* Cancel button — only within the 10-second window after placing */}
          {canCancel && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={cancelling}
              className="w-full py-3 border border-red-200 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
