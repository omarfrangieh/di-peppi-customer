"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { generateOrderNumber } from "@/lib/orderNumber";
import { db } from "@/lib/firebase";
import useCart from "../hooks/useCart";
import { formatPrice } from "@/lib/formatters";
import LocationPicker from "../components/LocationPicker";
import type { MapLocation, SavedAddress } from "../types";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  deliveryFee?: number;
}

// Lebanese public holidays (fixed national + Christian + Islamic) for 2025–2027
const UAE_HOLIDAYS = new Set([
  // ── 2025 ──────────────────────────────────────────────────
  "2025-01-01", "2025-01-06", "2025-02-09", "2025-03-22",
  "2025-03-30", "2025-03-31", "2025-04-01",
  "2025-04-18", "2025-04-21", "2025-05-01", "2025-05-06", "2025-05-25",
  "2025-06-05", "2025-06-06", "2025-06-07",
  "2025-06-26", "2025-07-05", "2025-08-15", "2025-09-04",
  "2025-11-01", "2025-11-22", "2025-12-25",
  // ── 2026 ──────────────────────────────────────────────────
  "2026-01-01", "2026-01-06", "2026-02-09",
  "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22",
  "2026-04-03", "2026-04-06", "2026-04-13",
  "2026-05-01", "2026-05-06", "2026-05-25",
  "2026-05-26", "2026-05-27", "2026-05-28",
  "2026-06-16", "2026-06-25", "2026-08-15", "2026-08-24",
  "2026-11-01", "2026-11-22", "2026-12-25",
  // ── 2027 ──────────────────────────────────────────────────
  "2027-01-01", "2027-01-06", "2027-02-09",
  "2027-03-09", "2027-03-10", "2027-03-22",
  "2027-03-26", "2027-03-29",
  "2027-05-01", "2027-05-03", "2027-05-06",
  "2027-05-16", "2027-05-17", "2027-05-18", "2027-05-25",
  "2027-06-05", "2027-06-14", "2027-08-13", "2027-08-15",
  "2027-11-01", "2027-11-22", "2027-12-25",
]);

function isValidDeliveryDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() === 0) return false;
  if (UAE_HOLIDAYS.has(dateStr)) return false;
  return true;
}

function getNextValidDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 30; i++) {
    const str = d.toISOString().split("T")[0];
    if (isValidDeliveryDate(str)) return str;
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

function getMinDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

const LABEL_ICONS: Record<string, string> = {
  Home: "🏠",
  Office: "🏢",
  Family: "👨‍👩‍👧",
  Other: "📍",
};
function labelIcon(label: string) {
  return LABEL_ICONS[label] || "📍";
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clear, getSubtotal } = useCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "cash" | "online">("wallet");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // Address state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [newAddress, setNewAddress] = useState("");
  const [newMapLocation, setNewMapLocation] = useState<MapLocation | null>(null);

  const subtotal = getSubtotal();
  const deliveryFee = customer?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const selectedSaved = savedAddresses.find(a => a.id === selectedAddressId) || null;
  const deliveryAddress = selectedSaved ? selectedSaved.address : newAddress;
  const deliveryMapLocation = selectedSaved ? selectedSaved.mapLocation : newMapLocation;

  useEffect(() => {
    setIsHydrated(true);
    const load = async () => {
      try {
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) { router.push("/customer/login"); return; }
        const session = JSON.parse(sessionStr);

        let firestoreData: any = {};
        try {
          const snap = await getDoc(doc(db, "customers", session.userId));
          if (snap.exists()) firestoreData = snap.data();
        } catch {}

        const name = firestoreData.name || session.name || session.email || "";
        const email = firestoreData.email || session.email || "";
        const phone = firestoreData.phoneNumber || firestoreData.phone || session.phone || "";

        setCustomer({ id: session.userId, name, email, phone, deliveryFee: 0 });
        setDeliveryPhone(phone);
        setDeliveryDate(getNextValidDate());

        // Load addresses array; fall back to legacy single address
        let addresses: SavedAddress[] = firestoreData.addresses || [];
        if (addresses.length === 0 && (firestoreData.address || session.address)) {
          addresses = [{
            id: "legacy",
            label: "Home",
            address: firestoreData.address || session.address || "",
            mapLocation: firestoreData.mapLocation || session.mapLocation || null,
          }];
        }
        setSavedAddresses(addresses);
        if (addresses.length > 0) setSelectedAddressId(addresses[0].id);
      } catch {
        router.push("/customer/login");
      }
    };
    load();
  }, [router]);

  const handlePlaceOrder = async () => {
    if (!customer || items.length === 0) { setError("Cart is empty"); return; }
    if (!deliveryAddress.trim()) { setError("Please select or enter a delivery address"); return; }
    if (!deliveryPhone.trim()) { setError("Please enter a phone number"); return; }
    if (!deliveryDate || !isValidDeliveryDate(deliveryDate)) { setError("Please select a valid delivery date (no Sundays or public holidays)"); return; }

    setIsProcessing(true);
    setError(null);

    try {
      const orderNumber = await generateOrderNumber();

      const orderRef = await addDoc(collection(db, "orders"), {
        name: orderNumber,
        customerName: customer.name,
        customerId: customer.id,
        customerType: "B2C",
        status: "Draft",
        source: "b2c",
        deliveryDate,
        deliveryAddress,
        deliveryPhone,
        deliveryAddressLabel: selectedSaved?.label || null,
        mapLocation: deliveryMapLocation || null,
        paymentMethod,
        specialInstructions: specialInstructions || null,
        deliveryFee,
        total,
        finalTotal: total,
        itemCount: items.length,
        createdAt: serverTimestamp(),
        email: customer.email,
      });

      const itemWrites = items.map((item) =>
        addDoc(collection(db, "orderItems"), {
          orderId: orderRef.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          priceAtTime: item.priceAtTime,
          lineTotal: item.priceAtTime * item.quantity,
        })
      );
      await Promise.all(itemWrites);

      clear();
      router.push(`/customer/orders/${orderRef.id}?confirmed=true`);
    } catch (err: any) {
      console.error("Error creating order:", err);
      setError(err.message || "Failed to place order. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isHydrated || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl mb-4">🛒</p>
          <p className="font-semibold text-gray-900 mb-4">Your cart is empty</p>
          <button onClick={() => router.push("/customer/products")} className="px-5 py-2.5 text-white font-semibold rounded-xl text-sm cursor-pointer hover:opacity-90" style={{ backgroundColor: "#1B2A5E" }}>
            ← Back to Products
          </button>
        </div>
      </div>
    );
  }

  const canPlaceOrder = !isProcessing && !!deliveryDate && !dateError && !!deliveryAddress.trim() && !!deliveryPhone.trim() && paymentMethod !== "online";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/customer/cart")} className="text-sm text-gray-500 hover:text-gray-700 font-medium cursor-pointer">← Back to Cart</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 space-y-5">

            {/* Delivery Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
              <div className="space-y-4">

                {/* Name & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name</label>
                    <input type="text" value={customer.name} disabled className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Phone <span className="text-red-500">*</span></label>
                    <input type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="Phone number" className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 ${!deliveryPhone.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`} />
                  </div>
                </div>

                {/* Delivery Address */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Delivery Address <span className="text-red-500">*</span></label>
                    {savedAddresses.length > 0 && (
                      <button onClick={() => router.push("/customer/profile")} className="text-xs font-semibold underline underline-offset-2 cursor-pointer" style={{ color: "#1B2A5E" }}>
                        Manage addresses
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Saved addresses */}
                    {savedAddresses.map((addr) => (
                      <label
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${selectedAddressId === addr.id ? "" : "border-gray-200 hover:border-gray-300"}`}
                        style={selectedAddressId === addr.id ? { borderColor: "#1B2A5E", backgroundColor: "#EEF1F8" } : {}}
                      >
                        <input type="radio" checked={selectedAddressId === addr.id} onChange={() => setSelectedAddressId(addr.id)} className="mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm">{labelIcon(addr.label)}</span>
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1B2A5E" }}>{addr.label}</span>
                          </div>
                          <p className="text-sm text-gray-800">{addr.address}</p>
                        </div>
                      </label>
                    ))}

                    {/* One-time address option */}
                    <label
                      onClick={() => setSelectedAddressId("new")}
                      className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${selectedAddressId === "new" ? "" : "border-gray-200 hover:border-gray-300"}`}
                      style={selectedAddressId === "new" ? { borderColor: "#1B2A5E", backgroundColor: "#EEF1F8" } : {}}
                    >
                      <input type="radio" checked={selectedAddressId === "new"} onChange={() => setSelectedAddressId("new")} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-gray-900 font-medium">Use a different address</p>
                        <p className="text-xs text-gray-400 mt-0.5">One-time delivery — not saved to profile</p>
                      </div>
                    </label>
                  </div>

                  {/* Selected saved address map */}
                  {selectedSaved?.mapLocation && (
                    <div className="mt-3">
                      <LocationPicker initial={selectedSaved.mapLocation} readOnly height={190} />
                    </div>
                  )}

                  {/* New address text + map */}
                  {selectedAddressId === "new" && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder="Enter delivery address"
                        rows={2}
                        autoFocus
                        className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none ${!newAddress.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                      />
                      <p className="text-xs text-gray-400">Drop a pin for precise location (optional)</p>
                      <LocationPicker
                        initial={newMapLocation}
                        height={190}
                        onChange={(loc, label) => {
                          setNewMapLocation(loc);
                          if (!newAddress.trim()) setNewAddress(label);
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Delivery Date */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Delivery Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={deliveryDate}
                    min={getMinDate()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDeliveryDate(val);
                      if (!val) setDateError("Please select a delivery date");
                      else if (new Date(val + "T00:00:00") < new Date(getMinDate() + "T00:00:00")) setDateError("Delivery must be at least next day");
                      else if (new Date(val + "T00:00:00").getDay() === 0) setDateError("We don't deliver on Sundays — please choose another day");
                      else if (UAE_HOLIDAYS.has(val)) setDateError("This date is a public holiday — please choose another day");
                      else setDateError(null);
                    }}
                    className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 ${dateError ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                  />
                  {dateError && <p className="text-xs text-red-600 mt-1">{dateError}</p>}
                  <p className="text-xs text-gray-400 mt-1">Next-day delivery · No Sundays or public holidays</p>
                </div>

                {/* Special Instructions */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Special Instructions</label>
                  <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} placeholder="e.g. Leave at door..." rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none" />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Payment Method</h2>
              <div className="space-y-3">
                {/* Wallet */}
                <label
                  className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === "wallet" ? "" : "border-gray-200 hover:border-gray-300"}`}
                  style={paymentMethod === "wallet" ? { borderColor: "#1B2A5E", backgroundColor: "#EEF1F8" } : {}}
                >
                  <input type="radio" value="wallet" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} className="mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Pay with Wallet</p>
                    <p className="text-xs text-gray-500">Use your prepaid wallet balance</p>
                  </div>
                </label>

                {/* Cash */}
                <label
                  className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === "cash" ? "" : "border-gray-200 hover:border-gray-300"}`}
                  style={paymentMethod === "cash" ? { borderColor: "#1B2A5E", backgroundColor: "#EEF1F8" } : {}}
                >
                  <input type="radio" value="cash" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} className="mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Cash on Delivery</p>
                    <p className="text-xs text-gray-500">Pay when you receive your order</p>
                  </div>
                </label>

                {/* Online Payment — coming soon */}
                <div
                  className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl opacity-60 cursor-not-allowed"
                  title="Coming soon"
                >
                  <input type="radio" disabled className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">Online Payment</p>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full"
                        style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>
                        Coming soon
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Credit / debit card · OMT · Whish</p>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-32">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">Order Summary</h2>
              <div className="space-y-2 border-b border-gray-100 pb-4 mb-4 max-h-56 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-xs">
                    <div>
                      <p className="text-gray-900 font-medium">{item.productName}</p>
                      <p className="text-gray-400">{item.quantity} × ${formatPrice(item.priceAtTime)}</p>
                    </div>
                    <p className="font-semibold text-gray-900">${formatPrice(item.priceAtTime * item.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-900">${formatPrice(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Delivery</span>
                    <span className="font-semibold text-gray-900">${formatPrice(deliveryFee)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-xl font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(total)}</span>
                </div>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={!canPlaceOrder}
                className="w-full py-3 text-white font-bold rounded-xl text-sm transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
                style={{ backgroundColor: canPlaceOrder ? "#1B2A5E" : undefined }}
              >
                {isProcessing ? "Placing Order..." : "Place Order"}
              </button>
              {paymentMethod === "online" && (
                <p className="text-xs text-center text-amber-600 mt-2 font-medium">Online payment coming soon — choose another method</p>
              )}
              <button onClick={() => router.push("/customer/products")} className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm font-medium mt-2 transition-colors cursor-pointer">
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
