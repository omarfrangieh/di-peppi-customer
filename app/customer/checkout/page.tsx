"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useCart from "../hooks/useCart";
import { formatPrice } from "@/lib/formatters";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  deliveryFee?: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clear, getSubtotal } = useCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "cash">("wallet");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const deliveryFee = customer?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  // Hydrate component and load customer profile
  useEffect(() => {
    setIsHydrated(true);

    try {
      const sessionStr = localStorage.getItem("session");
      if (!sessionStr) {
        router.push("/customer/login");
        return;
      }

      const session = JSON.parse(sessionStr);
      // For now, use session data as customer profile
      // In production, would fetch from getCustomerProfile Cloud Function
      setCustomer({
        id: session.userId,
        name: session.name || session.email,
        email: session.email,
        phone: session.phone || "",
        address: session.address || "",
        deliveryFee: 0,
      });
      setDeliveryAddress(session.address || "");
      setDeliveryPhone(session.phone || "");

      // Set default delivery date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDeliveryDate(tomorrow.toISOString().split("T")[0]);
    } catch (err) {
      console.error("Error loading customer profile:", err);
      router.push("/customer/login");
    }
  }, [router]);

  const handlePlaceOrder = async () => {
    if (!customer || items.length === 0) {
      setError("Cart is empty or customer not loaded");
      return;
    }

    if (!deliveryDate) {
      setError("Please select a delivery date");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Prepare order data
      const orderData = {
        customerId: customer.id,
        cartItems: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          priceAtTime: item.priceAtTime,
        })),
        deliveryDate,
        deliveryAddress,
        deliveryPhone,
        paymentMethod,
        specialInstructions,
        deliveryFee,
      };

      // Call Cloud Function to create order
      const createOrderFromCart = httpsCallable(functions, "createOrderFromCart");
      const result: any = await createOrderFromCart(orderData);

      if (result.data && result.data.orderId) {
        // Clear cart and redirect to order confirmation
        clear();
        router.push(`/customer/orders/${result.data.orderId}?confirmed=true`);
      } else {
        setError("Failed to create order. Please try again.");
      }
    } catch (err: any) {
      console.error("Error creating order:", err);
      setError(err.message || "Failed to create order. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isHydrated || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-4">🛒</p>
          <p className="text-gray-900 font-semibold mb-4">Your cart is empty</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/customer/cart")}
            className="text-gray-600 hover:text-gray-900 text-lg font-semibold"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Delivery Address</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={customer.name}
                    disabled
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Address
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter delivery address"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={customer.email}
                      disabled
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 disabled:opacity-75"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      placeholder="Enter phone number"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    style={{ "--tw-ring-color": "#1B2A5E" } as any}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Special Instructions (Optional)
                  </label>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="e.g., Please leave at door, contact before delivery..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                    style={{ "--tw-ring-color": "#1B2A5E" } as any}
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Payment Method</h2>
              <div className="space-y-3">
                <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value="wallet"
                    checked={paymentMethod === "wallet"}
                    onChange={(e) => setPaymentMethod(e.target.value as "wallet" | "cash")}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Pay with Wallet</p>
                    <p className="text-sm text-gray-600">Use your prepaid wallet balance</p>
                  </div>
                </label>

                <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value="cash"
                    checked={paymentMethod === "cash"}
                    onChange={(e) => setPaymentMethod(e.target.value as "wallet" | "cash")}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Pay with Cash</p>
                    <p className="text-sm text-gray-600">Pay on delivery</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 font-semibold">{error}</p>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div>
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 sticky top-24">
              <h2 className="font-semibold text-gray-900">Order Summary</h2>

              {/* Items List */}
              <div className="space-y-2 max-h-64 overflow-y-auto border-b border-gray-200 pb-4">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <div>
                      <p className="text-gray-900">{item.productName}</p>
                      <p className="text-gray-600">
                        {item.quantity} × ${formatPrice(item.priceAtTime)}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      ${formatPrice(item.priceAtTime * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-semibold text-gray-900">
                    ${formatPrice(subtotal)}
                  </span>
                </div>

                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Fee:</span>
                    <span className="font-semibold text-gray-900">
                      ${formatPrice(deliveryFee)}
                    </span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-bold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ${formatPrice(total)}
                  </span>
                </div>
              </div>

              {/* Place Order Button */}
              <button
                onClick={handlePlaceOrder}
                disabled={isProcessing || !deliveryDate}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
              >
                {isProcessing ? "Processing..." : "Place Order"}
              </button>

              {/* Continue Shopping Link */}
              <button
                onClick={() => router.push("/customer/products")}
                className="w-full py-2 text-gray-600 hover:text-blue-600 font-semibold text-sm transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
