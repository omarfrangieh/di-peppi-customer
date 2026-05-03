"use client";

import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function B2BLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"identifier" | "otp" | "verify">("identifier");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sendingOTP, setSendingOTP] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [otpMethod, setOtpMethod] = useState<"email" | "whatsapp">("email");

  useEffect(() => {
    const session = localStorage.getItem("b2b-session");
    if (session) router.push("/b2b");
  }, [router]);

  useEffect(() => {
    if (step === "verify") {
      const timer = setTimeout(handleCompleteLogin, 1500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSendOTP = async () => {
    if (!email) {
      setMessage(otpMethod === "email" ? "Please enter your email" : "Please enter your phone number");
      return;
    }

    if (otpMethod === "email" && !email.includes("@")) {
      setMessage("Please enter a valid email address");
      return;
    }

    if (otpMethod === "whatsapp" && !email.startsWith("+")) {
      setMessage("Please enter a valid phone number with country code (e.g. +961...)");
      return;
    }
    setSendingOTP(true);
    setMessage("");
    try {
      const sendOTPFn = httpsCallable(functions, "sendOTP");
      await sendOTPFn({ email, method: otpMethod });
      setOtpSuccess(true);
      setTimeout(() => { setOtpSuccess(false); setStep("otp"); }, 2000);
    } catch (err: any) {
      setMessage(`Failed: ${err.message}`);
    } finally {
      setSendingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setMessage("Please enter a valid 6-digit code");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const verifyOTPFn = httpsCallable(functions, "verifyOTP");
      const result: any = await verifyOTPFn({ target: email, otp, userId: email });
      if (result.data.success) {
        if (result.data.customToken) {
          await signInWithCustomToken(auth, result.data.customToken);
        }
        setStep("verify");
        setUserData(result.data);
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
        userId: userData.userId,
        email: userData.email || email,
        role: userData.role || "B2B",
        accountType: "b2b",
        customerType: "B2B",
        name: userData.name || companyName || "Business Account",
        companyName: userData.companyName || companyName || userData.name || "",
      };
      localStorage.setItem("b2b-session", JSON.stringify(session));
      if (userData.customToken) {
        localStorage.setItem("b2b-customToken", userData.customToken);
      }
      router.push("/b2b");
    } catch {
      router.push("/b2b");
    }
  };

  // Verify step
  if (step === "verify") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md border border-gray-200">
          <div className="text-center mb-8">
            <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="w-20 h-20 mx-auto mb-4 rounded-xl object-contain border border-gray-200 p-2" />
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-lg font-bold" style={{ color: "#1B2A5E" }}>Di Peppi</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded text-white uppercase" style={{ backgroundColor: "#1B2A5E" }}>B2B</span>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-green-700 font-semibold text-sm">✓ Login Verified</p>
          </div>
          <p className="text-center text-gray-600 text-sm mb-6">Welcome, {userData?.companyName || userData?.name || "Business Account"}! Redirecting to portal...</p>
          <div className="flex justify-center">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
          </div>
        </div>
      </div>
    );
  }

  // OTP step
  if (step === "otp") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md border border-gray-200">
          <div className="text-center mb-8">
            <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="w-20 h-20 mx-auto mb-4 rounded-xl object-contain border border-gray-200 p-2" />
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-lg font-bold" style={{ color: "#1B2A5E" }}>Di Peppi</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded text-white uppercase" style={{ backgroundColor: "#1B2A5E" }}>B2B</span>
            </div>
            <p className="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">Trade Portal</p>
          </div>

          {message && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center bg-red-50 text-red-700 font-medium">{message}</div>
          )}

          <p className="text-sm text-gray-600 mb-5 text-center">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            onKeyPress={(e) => e.key === "Enter" && handleVerifyOTP()}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-3xl font-bold tracking-widest focus:outline-none focus:border-blue-400 transition-all mb-5"
            style={{ color: "#1B2A5E" }}
          />

          <div className="space-y-3">
            <button
              onClick={handleVerifyOTP}
              disabled={loading}
              className="w-full text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 shadow-sm hover:shadow-md"
              style={{ backgroundColor: "#1B2A5E" }}
            >
              {loading ? "⏳ Verifying..." : "Verify Code"}
            </button>
            <button
              onClick={() => { setStep("identifier"); setOtp(""); setMessage(""); }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm transition-all"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Email entry step
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md border border-gray-200">
        <div className="text-center mb-8">
          <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="w-20 h-20 mx-auto mb-4 rounded-xl object-contain border border-gray-200 p-2" />
          <div className="flex items-center justify-center gap-2 mb-1">
            <p className="text-lg font-bold" style={{ color: "#1B2A5E" }}>Di Peppi</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded text-white uppercase" style={{ backgroundColor: "#1B2A5E" }}>B2B</span>
          </div>
          <p className="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">Trade Portal</p>
          <p className="text-sm text-gray-500 mt-3">Sign in to access your business account and wholesale pricing</p>
        </div>

        {otpSuccess && (
          <div className="mb-5 p-3 rounded-lg text-sm bg-green-50 text-green-700 text-center font-medium">✓ OTP sent to your email</div>
        )}
        {message && !otpSuccess && (
          <div className="mb-5 p-3 rounded-lg text-sm bg-red-50 text-red-700 text-center font-medium">{message}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{otpMethod === "email" ? "Business Email" : "Phone Number"}</label>
            <input
              type={otpMethod === "email" ? "email" : "tel"}
              placeholder={otpMethod === "email" ? "orders@yourbusiness.com" : "+961123456"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendOTP()}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400"
              disabled={sendingOTP}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Company Name <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
            <input
              type="text"
              placeholder="Your company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400"
              disabled={sendingOTP}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Receive OTP via</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOtpMethod("email")}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${otpMethod === "email" ? "text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                style={{ backgroundColor: otpMethod === "email" ? "#1B2A5E" : undefined }}
              >
                📧 Email
              </button>
              <button
                onClick={() => setOtpMethod("whatsapp")}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${otpMethod === "whatsapp" ? "text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                style={{ backgroundColor: otpMethod === "whatsapp" ? "#25D366" : undefined }}
              >
                💬 WhatsApp
              </button>
            </div>
          </div>

          <button
            onClick={handleSendOTP}
            disabled={sendingOTP}
            className="w-full text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 shadow-sm hover:shadow-md"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            {sendingOTP ? "⏳ Sending..." : "Send Login Code"}
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-xs text-blue-700 font-medium">🏢 B2B Trade Portal</p>
          <p className="text-xs text-blue-600 mt-1">Access wholesale pricing, bulk ordering, and invoice payment terms. For B2C retail orders, visit the <a href="/customer/login" className="underline font-medium">Online Shop</a>.</p>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            New business?{" "}
            <a href="/b2b/signup" className="font-semibold underline" style={{ color: "#1B2A5E" }}>
              Request trade access →
            </a>
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">© 2026 Di Peppi. All rights reserved.</p>
      </div>
    </div>
  );
}
