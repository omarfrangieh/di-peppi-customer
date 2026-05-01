"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateOrderNumber } from "@/lib/orderNumber";
import useB2BCart from "../hooks/useCart";
import { formatPrice } from "@/lib/formatters";

type PaymentMethod = "invoice_net30" | "invoice_net60" | "wallet" | "cash";

const LB_HOLIDAYS = new Set([
  "2025-01-01","2025-01-06","2025-02-09","2025-03-22","2025-03-30","2025-03-31","2025-04-01",
  "2025-04-18","2025-04-21","2025-05-01","2025-05-06","2025-05-25","2025-06-05","2025-06-06",
  "2025-06-07","2025-06-26","2025-07-05","2025-08-15","2025-09-04","2025-11-01","2025-11-22","2025-12-25",
  "2026-01-01","2026-01-06","2026-02-09","2026-03-19","2026-03-20","2026-03-21","2026-03-22",
  "2026-04-03","2026-04-06","2026-04-13","2026-05-01","2026-05-06","2026-05-25","2026-05-26",
  "2026-05-27","2026-05-28","2026-06-16","2026-06-25","2026-08-15","2026-08-24","2026-11-01",
  "2026-11-22","2026-12-25",
  "2027-01-01","2027-01-06","2027-02-09","2027-03-09","2027-03-10","2027-03-22","2027-03-26",
  "2027-03-29","2027-05-01","2027-05-03","2027-05-06","2027-05-16","2027-05-17","2027-05-18",
  "2027-05-25","2027-06-05","2027-06-14","2027-08-13","2027-08-15","2027-11-01","2027-11-22","2027-12-25",
]);

function isValidDeliveryDate(d: string) {
  if (!d) return false;
  if (new Date(d + "T00:00:00").getDay() === 0) return false;
  if (LB_HOLIDAYS.has(d)) return false;
  return true;
}

function getNextValidDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 30; i++) {
    const s = d.toISOString().split("T")[0];
    if (isValidDeliveryDate(s)) return s;
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

function getMinDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

interface B2BSession {
  userId: string;
  name: string;
  email: string;
  companyName?: string;
}

export default function B2BCheckoutPage() {
  const router = useRouter();
  const { items, clear, getSubtotal } = useB2BCart();
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<B2BSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // Form fields
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [poReference, setPoReference] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("invoice_net30");
  const [specialInstructions, setSpecialInstructions] = useState("");

  useEffect(() => {
    setIsHydrated(true);
    try {
      const raw = localStorage.getItem("b2b-session");
      if (!raw) { router.push("/b2b/login"); return; }
      const s = JSON.parse(raw);
      setSession(s);
      setCompanyName(s.companyName || s.name || "");
      setContactName(s.name || "");
      setDeliveryPhone(s.phone || "");
      setDeliveryAddress(s.address || "");

      setDeliveryDate(getNextValidDate());
    } catch {
      router.push("/b2b/login");
    }
  }, [router]);

  const subtotal = getSubtotal();

  const handlePlaceOrder = async () => {
    if (!session || items.length === 0) {
      setError("Cart is empty or not logged in");
      return;
    }
    if (!deliveryDate || !isValidDeliveryDate(deliveryDate)) { setError("Please select a valid delivery date (no Sundays or public holidays)"); return; }
    if (!companyName.trim()) { setError("Please enter company name"); return; }
    if (!deliveryAddress.trim()) { setError("Please enter delivery address"); return; }

    setIsProcessing(true);
    setError(null);

    try {
      const orderNumber = await generateOrderNumber();

      // Write order document to Firestore orders collection
      const orderRef = await addDoc(collection(db, "orders"), {
        name: orderNumber,
        customerName: companyName,
        customerId: session.userId,
        customerType: "B2B",
        contactName,
        companyName,
        vatNumber: vatNumber || null,
        poReference: poReference || null,
        status: "Draft",
        source: "b2b",
        deliveryDate,
        deliveryAddress,
        deliveryPhone,
        paymentMethod,
        specialInstructions: specialInstructions || null,
        total: subtotal,
        itemCount: items.length,
        createdAt: serverTimestamp(),
        email: session.email,
      });

      // Write each order item to orderItems collection
      const itemWrites = items.map((item) =>
        addDoc(collection(db, "orderItems"), {
          orderId: orderRef.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          priceAtTime: item.priceAtTime,
          unit: item.unit,
          caseSize: item.caseSize || null,
          lineTotal: item.priceAtTime * item.quantity,
        })
      );
      await Promise.all(itemWrites);

      clear();
      router.push(`/b2b/orders/${orderRef.id}?confirmed=true`);
    } catch (err: any) {
      console.error("Error creating B2B order:", err);
      setError(err.message || "Failed to submit order. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isHydrated || !session) {
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
          <button
            onClick={() => router.push("/b2b/products")}
            className="px-5 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Back to Catalogue
          </button>
        </div>
      </div>
    );
  }

  const paymentOptions: { value: PaymentMethod; label: string; desc: string; icon: string }[] = [
    { value: "invoice_net30", label: "Invoice – Net 30", desc: "Pay within 30 days of invoice date", icon: "📄" },
    { value: "invoice_net60", label: "Invoice – Net 60", desc: "Pay within 60 days of invoice date", icon: "📋" },
    { value: "wallet", label: "Wallet Balance", desc: "Deduct from your prepaid account", icon: "💳" },
    { value: "cash", label: "Cash on Delivery", desc: "Pay upon receipt of goods", icon: "💵" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/b2b/cart")}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            ← Back to Cart
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Submit Order</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Forms */}
          <div className="lg:col-span-2 space-y-5">
            {/* Company Details */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>🏢</span> Company Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Company Name *</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your company name"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Contact Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Contact person"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">VAT Number</label>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="e.g. AE123456789"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Your PO Reference</label>
                  <input
                    type="text"
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="e.g. PO-2026-001"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={session.email}
                    disabled
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-sm text-gray-500 bg-gray-50"
                  />
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>🚚</span> Delivery Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Delivery Address *</label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Full delivery address"
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Phone / WhatsApp</label>
                    <input
                      type="tel"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      placeholder="+971 XX XXX XXXX"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Requested Delivery Date *</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      min={getMinDate()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDeliveryDate(val);
                        if (!val) setDateError("Please select a delivery date");
                        else if (new Date(val + "T00:00:00").getDay() === 0) setDateError("We don't deliver on Sundays");
                        else if (LB_HOLIDAYS.has(val)) setDateError("This date is a public holiday — please choose another day");
                        else setDateError(null);
                      }}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors ${dateError ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                    />
                    {dateError && <p className="text-xs text-red-600 mt-1">{dateError}</p>}
                    <p className="text-xs text-gray-400 mt-1">Next-day · No Sundays or public holidays</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Special Instructions</label>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Receiving hours, dock instructions, temperature requirements..."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>💳</span> Payment Terms
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paymentOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === opt.value
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={opt.value}
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{opt.icon} {opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Right: Summary */}
          <div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-32">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">Order Summary</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto border-b border-gray-100 pb-4 mb-4">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-xs">
                    <div className="mr-2">
                      <p className="text-gray-900 font-medium">{item.productName}</p>
                      <p className="text-gray-400">{item.quantity} × ${formatPrice(item.priceAtTime)}</p>
                    </div>
                    <p className="font-semibold text-gray-900 shrink-0">${formatPrice(item.priceAtTime * item.quantity)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-900">${formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery</span>
                  <span className="text-gray-400 text-xs">TBD</span>
                </div>
                {poReference && (
                  <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                    <span>PO Ref</span>
                    <span className="font-mono">{poReference}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-sm">Total (excl. delivery)</span>
                  <span className="text-xl font-bold" style={{ color: "#1B2A5E" }}>${formatPrice(subtotal)}</span>
                </div>
              </div>

              <button
                onClick={handlePlaceOrder}
                disabled={isProcessing || !deliveryDate || !!dateError || !companyName.trim() || !deliveryAddress.trim()}
                className="w-full py-3 text-white font-bold rounded-xl text-sm transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: isProcessing || !deliveryDate || !!dateError || !companyName.trim() || !deliveryAddress.trim() ? undefined : "#1B2A5E" }}
              >
                {isProcessing ? "Submitting..." : "Submit Order"}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">Order will be confirmed by our team</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
