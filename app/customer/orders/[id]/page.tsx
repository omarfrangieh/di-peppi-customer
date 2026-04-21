"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtTime: number;
}

interface Order {
  id: string;
  name?: string;
  customerId: string;
  status: "pending" | "confirmed" | "delivered" | "cancelled";
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryDate: string;
  paymentMethod: "wallet" | "cash";
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const isConfirmed = searchParams.get("confirmed") === "true";

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      setError(null);

      try {
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) {
          router.push("/customer/login");
          return;
        }

        // Fetch order document
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) {
          setError("Order not found");
          return;
        }
        const orderData = orderSnap.data();

        // Items are stored directly on the order document as an array
        const items: OrderItem[] = Array.isArray(orderData.items)
          ? orderData.items.map((item: any) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              priceAtTime: item.priceAtTime ?? item.unitPrice ?? 0,
            }))
          : [];

        // Convert Firestore Timestamps to strings
        const toDateStr = (val: any) => {
          if (!val) return new Date().toISOString();
          if (typeof val?.toDate === "function") return val.toDate().toISOString();
          if (typeof val === "object" && val.seconds) return new Date(val.seconds * 1000).toISOString();
          return String(val);
        };

        const subtotal = items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);

        setOrder({
          id: orderId,
          name: orderData.name || orderData.orderNumber || undefined,
          customerId: orderData.customerId,
          status: (orderData.status || "confirmed").toLowerCase() as any,
          items,
          subtotal: orderData.subtotal ?? subtotal,
          deliveryFee: orderData.deliveryFee ?? 0,
          total: orderData.grandTotal ?? orderData.total ?? subtotal,
          deliveryDate: toDateStr(orderData.deliveryDate),
          paymentMethod: orderData.paymentMethod?.toLowerCase() ?? "wallet",
          specialInstructions: orderData.specialInstructions || orderData.notes || "",
          createdAt: toDateStr(orderData.createdAt),
          updatedAt: toDateStr(orderData.updatedAt || orderData.createdAt),
        });
      } catch (err: any) {
        console.error("Error loading order:", err);
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-4">❌</p>
          <p className="text-gray-900 font-semibold mb-4">{error || "Order not found"}</p>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Back to Products
          </button>
        </div>
      </div>
    );
  }

  const statusColors = {
    pending: "bg-yellow-50 text-yellow-600",
    confirmed: "bg-green-50 text-green-600",
    delivered: "bg-blue-50 text-blue-600",
    cancelled: "bg-red-50 text-red-600",
  };

  const statusLabels = {
    pending: "Pending Confirmation",
    confirmed: "Confirmed",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Order Details</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Confirmation Banner */}
        {isConfirmed && (
          <div className="mb-8 bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-3xl mb-2">✅</p>
            <h2 className="text-2xl font-bold text-green-600 mb-2">Order Confirmed!</h2>
            <p className="text-gray-600">
              Your order has been successfully placed. You will receive updates about your delivery via email and SMS.
            </p>
          </div>
        )}

        {/* Order Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-gray-600">Order</p>
              <p className="text-2xl font-bold text-gray-900">{order.name || order.id}</p>
              {order.name && <p className="text-xs text-gray-400 mt-0.5">{order.id}</p>}
            </div>
            <div className={`px-4 py-2 rounded-lg font-semibold ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Order Date</p>
              <p className="text-gray-900 font-semibold">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Delivery Date</p>
              <p className="text-gray-900 font-semibold">
                {new Date(order.deliveryDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Payment Method</p>
              <p className="text-gray-900 font-semibold capitalize">{order.paymentMethod}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-blue-600">${formatPrice(order.total)}</p>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
          {order.items.length > 0 ? (
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.productId} className="flex justify-between items-center pb-4 border-b border-gray-200 last:border-0">
                  <div>
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-600">
                      {item.quantity} × ${formatPrice(item.priceAtTime)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    ${formatPrice(item.priceAtTime * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No items in this order</p>
          )}
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-semibold text-gray-900">${formatPrice(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery Fee:</span>
                <span className="font-semibold text-gray-900">
                  ${formatPrice(order.deliveryFee)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 flex justify-between">
              <span className="font-bold text-gray-900">Total:</span>
              <span className="text-2xl font-bold text-blue-600">${formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {order.specialInstructions && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Special Instructions</h2>
            <p className="text-gray-600">{order.specialInstructions}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/customer/products")}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            Continue Shopping
          </button>
          <button
            onClick={() => router.push("/customer/orders")}
            className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
          >
            View All Orders
          </button>
        </div>
      </div>
    </div>
  );
}
