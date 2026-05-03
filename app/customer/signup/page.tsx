"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function CustomerSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async () => {
    if (!name.trim()) {
      setMessage("Please enter your name");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setMessage("Please enter your email or phone number");
      return;
    }
    if (email && !email.includes("@")) {
      setMessage("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const signupFn = httpsCallable(functions, "signupCustomer");
      await signupFn({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/customer/login");
      }, 2000);
    } catch (err: any) {
      const msg = err.message || "Signup failed";
      if (msg.includes("already-exists") || msg.includes("already exists")) {
        setMessage("An account with this email or phone already exists. Please log in.");
      } else {
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/Di-Peppi-White-Background.jpg"
              alt="Di Peppi Logo"
              className="w-24 h-24 mx-auto mb-4 rounded-lg object-contain bg-white p-2"
            />
          </div>
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-700 text-center font-semibold text-sm">
              ✓ Account created! Redirecting to login...
            </p>
          </div>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/Di-Peppi-White-Background.jpg"
            alt="Di Peppi Logo"
            className="w-24 h-24 mx-auto mb-4 rounded-lg object-contain bg-white p-2"
          />
          <p className="text-xs text-gray-500 font-semibold tracking-widest uppercase">Create Account</p>
        </div>

        {message && (
          <div className="mb-6 p-4 rounded-lg text-sm bg-red-50 text-red-700 text-center font-semibold">
            {message}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              placeholder="+961 XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full text-white py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            {loading ? "⏳ Creating account..." : "Create Account"}
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/customer/login")}
            className="font-semibold hover:underline"
            style={{ color: "#1B2A5E" }}
          >
            Log in
          </button>
        </p>

        <p className="text-xs text-gray-400 text-center mt-6">
          © 2026 Di Peppi. All rights reserved.
        </p>
      </div>
    </div>
  );
}
