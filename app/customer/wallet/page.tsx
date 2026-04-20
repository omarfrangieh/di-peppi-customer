"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/formatters";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

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

        // Mock customer data
        setCustomer({
          id: customerId,
          walletBalance: 500, // Default balance for MVP
        });

        // Try to fetch transaction history from Cloud Function
        try {
          const getWalletTransactions = httpsCallable(
            functions,
            "getWalletTransactionHistory"
          );
          const result: any = await getWalletTransactions({ customerId });

          if (result.data && Array.isArray(result.data)) {
            setTransactions(result.data);
          }
        } catch (err) {
          // Cloud Function might not exist yet, use empty transactions
          setTransactions([]);
        }
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
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Wallet</h1>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Continue Shopping
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Wallet Balance Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-8 text-white mb-8 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium mb-2">Wallet Balance</p>
              <p className="text-5xl font-bold">${formatPrice(customer.walletBalance)}</p>
            </div>
            <div className="text-6xl opacity-20">💳</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            className="py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
          >
            Add Credit
          </button>
          <button
            onClick={() => router.push("/customer/orders")}
            className="py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
          >
            View Order History
          </button>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h2>

          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-gray-600">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Description</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            tx.type === "credit"
                              ? "bg-green-50 text-green-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {tx.type === "credit" ? "+" : "-"}
                          {tx.type === "credit" ? "Credit" : "Debit"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-900">{tx.description}</td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          tx.type === "credit" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {tx.type === "credit" ? "+" : "-"}${formatPrice(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">About Your Wallet</h3>
          <p className="text-blue-800 text-sm">
            Your wallet is a prepaid account. Add credits and use them to pay for orders. Credits never expire and can be used anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
