"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

interface WalletTransaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  reference?: string;
  createdAt: string;
}

interface Customer {
  id: string;
  walletBalance: number;
}

export default function WalletPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCredit, setShowAddCredit] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
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

        // Fetch real wallet balance from Firestore
        const customerDoc = await getDoc(doc(db, "customers", customerId));
        if (!customerDoc.exists()) {
          throw new Error("Customer not found");
        }
        const customerData = customerDoc.data();
        setCustomer({
          id: customerId,
          walletBalance: customerData.walletBalance ?? 0,
        });

        // Fetch transaction history from Firestore
        const txQuery = query(
          collection(db, "walletTransactions"),
          where("customerId", "==", customerId)
        );
        const txSnap = await getDocs(txQuery);
        const txList = txSnap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type as "credit" | "debit",
              amount: data.amount,
              description: data.description,
              reference: data.invoiceNumber,
              createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            };
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTransactions(txList);
      } catch (err: any) {
        console.error("Error loading wallet:", err);
        setError(err.message || "Failed to load wallet data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-4">❌</p>
          <p className="text-gray-900 font-semibold mb-4">{error || "Failed to load wallet"}</p>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 text-white font-semibold rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
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

      {/* Add Credit Modal */}
      {showAddCredit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowAddCredit(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl"
              style={{ backgroundColor: "#EEF1F8" }}
            >
              💳
            </div>

            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Add Credit</h2>
            <p className="text-sm text-gray-500 text-center mb-5">
              Online top-up is coming soon. For now, contact us and we'll credit your wallet manually.
            </p>

            {/* Contact options */}
            <div className="space-y-3 mb-5">
              <a
                href="https://wa.me/96171521714"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="text-xl">💬</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">WhatsApp</p>
                  <p className="text-xs text-gray-400">Chat with us to add credit</p>
                </div>
              </a>
              <a
                href="tel:+96171521714"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="text-xl">📞</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Call Us</p>
                  <p className="text-xs text-gray-400">+961 71 521 714</p>
                </div>
              </a>
            </div>

            <button
              onClick={() => setShowAddCredit(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors cursor-pointer text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Page Title */}
        <h1 className="text-2xl font-bold mb-6" style={{ color: "#B5535A" }}>My Wallet</h1>

        {/* Balance Card */}
        <div
          className="rounded-xl p-6 text-white mb-6"
          style={{ background: "linear-gradient(135deg, #1B2A5E 0%, #2d4080 100%)" }}
        >
          <p className="text-white/70 text-sm font-medium mb-1">Current Balance</p>
          <p className="text-4xl font-bold">${formatPrice(customer.walletBalance)}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowAddCredit(true)}
            className="flex-1 py-2.5 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer text-sm"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            Add Credit
          </button>
          <button
            onClick={() => router.push("/customer/orders")}
            className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold rounded-xl transition-colors cursor-pointer text-sm"
          >
            View Orders
          </button>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Transaction History</h2>
          </div>

          {transactions.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-500 text-sm">No transactions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                      style={{
                        backgroundColor: tx.type === "credit" ? "#f0fdf4" : "#fef2f2",
                        color: tx.type === "credit" ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {tx.type === "credit" ? "↓" : "↑"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(tx.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {tx.reference && (
                          <span className="ml-2 text-gray-400">· {tx.reference}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-sm font-bold ml-4 flex-shrink-0"
                    style={{ color: tx.type === "credit" ? "#16a34a" : "#dc2626" }}
                  >
                    {tx.type === "credit" ? "+" : "-"}${formatPrice(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info note */}
        <p className="text-xs text-gray-400 text-center mt-6">
          Wallet credits never expire and can be used on any order.
        </p>
      </div>
    </div>
  );
}
