"use client";

import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"identifier" | "otp" | "verify">("identifier");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("adminSavedEmail");
    if (saved) setEmail(saved);
  }, []);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sendingOTP, setSendingOTP] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);

  useEffect(() => {
    const session = localStorage.getItem("session");
    if (session) {
      router.push("/admin");
    }
  }, [router]);

  // Auto-redirect after verification
  useEffect(() => {
    if (step === "verify") {
      const timer = setTimeout(() => {
        handleCompleteLogin();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSendOTP = async () => {
    if (!email) {
      setMessage("Please enter your email");
      return;
    }

    // Basic email validation
    if (!email.includes("@")) {
      setMessage("Please enter a valid email");
      return;
    }

    setSendingOTP(true);
    setMessage("");

    try {
      const sendOTPFn = httpsCallable(functions, "sendOTP");
      await sendOTPFn({
        email,
        method: "email",
      });
      setMessage("");
      localStorage.setItem("adminSavedEmail", email);
      setOtpSuccess(true);
      setTimeout(() => {
        setOtpSuccess(false);
        setStep("otp");
      }, 2000);
    } catch (err: any) {
      setMessage(`Failed: ${err.message}`);
    } finally {
      setSendingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setMessage("Please enter valid 6-digit OTP");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const verifyOTPFn = httpsCallable(functions, "verifyOTP");
      const result: any = await verifyOTPFn({
        target: email,
        otp,
        userId: email,
      });

      if (result.data.success) {
        // Check if user is admin
        const isAdmin = result.data.role === "Admin" || result.data.accountType === "admin";
        if (!isAdmin) {
          setMessage("Access denied. Admin account required.");
          setStep("identifier");
          return;
        }

        // Sign in with custom token
        if (result.data.customToken) {
          await signInWithCustomToken(auth, result.data.customToken);
        }

        setStep("verify");
        setAdminData(result.data);
      }
    } catch (err: any) {
      setMessage(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteLogin = async () => {
    try {
      const session = {
        userId: adminData.userId,
        email: adminData.email || email,
        role: adminData.role || "Admin",
        accountType: adminData.accountType || "admin",
        name: adminData.name || "Admin",
      };
      localStorage.setItem("session", JSON.stringify(session));

      // Do NOT store customToken — it's one-time use only.
      // Firebase Auth manages the session via its own refresh tokens.

      router.push("/admin");
    } catch (err: any) {
      console.error("Login complete error:", err);
      router.push("/admin");
    }
  };

  // Verify step - auto-redirecting
  if (step === "verify") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/Di-Peppi-White-Background.jpg"
              alt="Di Peppi Logo"
              className="w-24 h-24 mx-auto mb-4 rounded-lg object-contain bg-white p-2"
            />
            <p className="text-sm text-gray-500 font-semibold tracking-widest uppercase">Admin Panel</p>
          </div>

          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-8">
            <p className="text-green-700 text-center font-semibold text-sm">
              ✓ Login Verified
            </p>
          </div>

          <div className="text-center mb-8">
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Welcome, {adminData?.name || "Admin"}!
            </p>
            <p className="text-sm text-gray-600">
              Redirecting to dashboard...
            </p>
          </div>

          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  // OTP verification step
  if (step === "otp") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/Di-Peppi-White-Background.jpg"
              alt="Di Peppi Logo"
              className="w-24 h-24 mx-auto mb-4 rounded-lg object-contain bg-white p-2"
            />
            <p className="text-sm text-gray-500 font-semibold tracking-widest uppercase">Verify Code</p>
          </div>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg text-sm text-center font-semibold ${
                message.includes("✓")
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <p className="text-sm text-gray-600 mb-6 text-center">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>

          <input
            type="text"
            placeholder="000000"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            onKeyPress={(e) => e.key === "Enter" && handleVerifyOTP()}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-center text-3xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all mb-6"
            style={{color: "#1B2A5E"}}
          />

          <div className="space-y-3">
            <button
              onClick={handleVerifyOTP}
              disabled={loading}
              className="w-full text-white py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              style={{backgroundColor: "#1B2A5E"}}
            >
              {loading ? "⏳ Verifying..." : "Verify OTP"}
            </button>

            <button
              onClick={() => {
                setStep("identifier");
                setOtp("");
                setMessage("");
              }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold text-sm transition-all"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Identifier step (email entry)
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/Di-Peppi-White-Background.jpg"
            alt="Di Peppi Logo"
            className="w-24 h-24 mx-auto mb-4 rounded-lg object-contain bg-white p-2"
          />
          <p className="text-xs text-gray-500 font-semibold tracking-widest uppercase">Admin Panel</p>
        </div>

        {otpSuccess && (
          <div className="mb-6 p-4 rounded-lg text-sm bg-green-50 text-green-700 text-center font-semibold">
            ✓ OTP sent to your email
          </div>
        )}

        {message && !otpSuccess && (
          <div className="mb-6 p-4 rounded-lg text-sm bg-red-50 text-red-700 text-center font-semibold">
            {message}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
              Admin Email
            </label>
            <input
              type="email"
              placeholder="admin@dipeppi.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendOTP()}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
              disabled={sendingOTP}
            />
          </div>

          <button
            onClick={handleSendOTP}
            disabled={sendingOTP}
            className="w-full text-white py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            style={{backgroundColor: "#1B2A5E"}}
          >
            {sendingOTP ? "⏳ Sending..." : "Send OTP"}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          © 2026 Di Peppi. All rights reserved.
        </p>
      </div>
    </div>
  );
}
