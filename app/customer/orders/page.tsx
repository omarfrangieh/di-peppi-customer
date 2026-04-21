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
  name?: string;
  customerId: string;
  status: "Draft" | "Confirmed" | "Preparing" | "To Deliver" | "Delivered" | "Cancelled" | "pending" | "confirmed" | "delivered" | "cancelled";
  items: OrderItem[] | number;  // Cloud Function returns item count as number
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

        const list = (result.data as any)?.orders ?? result.data;
        if (Array.isArray(list)) {
          setOrders(list);
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

  const normalizeStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      "pending": "Draft",
      "Draft": "Draft",
      "confirmed": "Confirmed",
      "Confirmed": "Confirmed",
      "preparing": "Preparing",
      "Preparing": "Preparing",
      "to deliver": "To Deliver",
      "To Deliver": "To Deliver",
      "delivered": "Delivered",
      "Delivered": "Delivered",
      "cancelled": "Cancelled",
      "Cancelled": "Cancelled",
    };
    return statusMap[status] || status;
  };

  const statusColors: Record<string, string> = {
    Draft: "bg-gray-50 text-gray-600",
    Confirmed: "bg-green-50 text-green-600",
    Preparing: "bg-yellow-50 text-yellow-600",
    "To Deliver": "bg-orange-50 text-orange-600",
    Delivered: "bg-blue-50 text-blue-600",
    Cancelled: "bg-red-50 text-red-600",
  };

  const statusLabels: Record<string, string> = {
    Draft: "Draft",
    Confirmed: "Confirmed",
    Preparing: "Preparing",
    "To Deliver": "To Deliver",
    Delivered: "Delivered",
    Cancelled: "Cancelled",
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
                    <p className="text-sm text-gray-600">Order</p>
                    <p className="text-lg font-bold text-gray-900">{order.name || order.id}</p>
                    {order.name && <p className="text-xs text-gray-400">{order.id}</p>}
                  </div>
                  <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${statusColors[normalizeStatus(order.status)]}`}>
                    {statusLabels[normalizeStatus(order.status)]}
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
                    <p className="text-gray-900 font-semibold">
                      {typeof order.items === "number" ? order.items : (order.items as OrderItem[]).length}
                    </p>
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
                {Array.isArray(order.items) && order.items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-2">Items:</p>
                    <p className="text-sm text-gray-900">
                      {(order.items as OrderItem[]).map((item) => item.productName).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
