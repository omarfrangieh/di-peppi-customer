"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  deliveryInstructions?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load customer profile
  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const sessionStr = localStorage.getItem("session");
        if (!sessionStr) {
          router.push("/customer/login");
          return;
        }

        const session = JSON.parse(sessionStr);

        // Mock customer data from session for MVP
        const customerData: Customer = {
          id: session.userId,
          name: session.name || session.email,
          email: session.email,
          phone: session.phone || "",
          address: session.address || "123 Main St",
          deliveryInstructions: session.deliveryInstructions || "",
        };

        setCustomer(customerData);
        setFormData(customerData);
      } catch (err: any) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
        router.push("/customer/login");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (formData) {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSaveProfile = async () => {
    if (!formData) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // For MVP, just update localStorage
      const sessionStr = localStorage.getItem("session");
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        const updatedSession = {
          ...session,
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          deliveryInstructions: formData.deliveryInstructions,
        };
        localStorage.setItem("session", JSON.stringify(updatedSession));
      }

      setCustomer(formData);
      setSuccess("Profile updated successfully!");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error saving profile:", err);
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("session");
    router.push("/customer/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer || !formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-4">❌</p>
          <p className="text-gray-900 font-semibold mb-4">Failed to load profile</p>
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            ← Back to Products
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-600 font-semibold">{success}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 font-semibold">{error}</p>
          </div>
        )}

        {/* Profile Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Personal Information</h2>

          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                style={{ "--tw-ring-color": "#1B2A5E" } as any}
              />
            </div>

            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 disabled:opacity-75"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                style={{ "--tw-ring-color": "#1B2A5E" } as any}
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                style={{ "--tw-ring-color": "#1B2A5E" } as any}
              />
            </div>

            {/* Delivery Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Instructions (Optional)
              </label>
              <textarea
                name="deliveryInstructions"
                value={formData.deliveryInstructions}
                onChange={handleChange}
                placeholder="e.g., Please ring bell twice, leave at side gate, etc."
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                style={{ "--tw-ring-color": "#1B2A5E" } as any}
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => setFormData(customer)}
              className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Account</h2>

          <div className="space-y-4">
            {/* Account Info */}
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Customer ID</p>
                <p className="text-sm text-gray-600">{customer.id}</p>
              </div>
            </div>

            {/* Logout Button */}
            <div className="pt-4">
              <button
                onClick={handleLogout}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
