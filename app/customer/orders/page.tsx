"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtTime: number;
}

interface Order {
  id: string;
  customerId: string;
  status: "pending" | "confirmed" | "delivered" | "cancelled";
  items: OrderItem[];
  total: number;
  deliveryDate: string;
  paymentMethod: "wallet" | "cash";
  createdAt: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) {
          router.push("/customer/login");
          return;
        }

        const session = JSON.parse(sessionStr);
        const customerId = session.userId;

        // Call Cloud Function to fetch order history
        const getOrderHistory = httpsCallable(functions, "getOrderHistory");
        const result: any = await getOrderHistory({ customerId });

        if (result.data && Array.isArray(result.data)) {
          setOrders(result.data);
        } else {
          setOrders([]);
        }
      } catch (err: any) {
        console.error("Error fetching orders:", err);
        setError(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
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
    pending: "Pending",
    confirmed: "Confirmed",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Order History</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              {orders.length} order{orders.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Continue Shopping
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 font-semibold">{error}</p>
          </div>
        )}

        {orders.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-4xl mb-4">📦</p>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-gray-600 mb-6">Start shopping to create your first order!</p>
            <button
              onClick={() => router.push("/customer/products")}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              Browse Products
            </button>
          </div>
        ) : (
          /* Orders List */
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Order ID</p>
                    <p className="text-lg font-bold text-gray-900">{order.id}</p>
                  </div>
                  <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${statusColors[order.status]}`}>
                    {statusLabels[order.status]}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Order Date</p>
                    <p className="text-gray-900 font-semibold">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Items</p>
                    <p className="text-gray-900 font-semibold">{order.items.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Delivery Date</p>
                    <p className="text-gray-900 font-semibold">
                      {new Date(order.deliveryDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Total</p>
                    <p className="text-2xl font-bold text-blue-600">${formatPrice(order.total)}</p>
                  </div>
                </div>

                {/* Items Preview */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Items:</p>
                  <p className="text-sm text-gray-900">
                    {order.items.map((item) => item.productName).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
