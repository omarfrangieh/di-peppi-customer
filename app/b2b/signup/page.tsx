"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export default function B2BSignupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Form fields
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mofNumber, setMofNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) {
      setError("Only PDF, JPG, PNG, or WEBP files are accepted");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File must be under 10 MB");
      return;
    }
    setError("");
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!companyName.trim() || !contactName.trim() || !email.trim() || !mofNumber.trim() || !vatNumber.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (!file) {
      setError("Please upload your official business document");
      return;
    }

    setLoading(true);
    try {
      // 1. Upload document to Firebase Storage
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${companyName.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
      const storageRef = ref(storage, `b2b-documents/${fileName}`);

      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        task.on(
          "state_changed",
          (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve()
        );
      });

      const documentUrl = await getDownloadURL(storageRef);
      setUploadProgress(null);

      // 2. Create pending B2B request via Cloud Function
      const requestB2BAccess = httpsCallable(functions, "requestB2BAccess");
      await requestB2BAccess({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        mofNumber: mofNumber.trim(),
        vatNumber: vatNumber.trim(),
        officialDocumentUrl: documentUrl,
        officialDocumentName: file.name,
      });

      setStep("success");
    } catch (err: any) {
      console.error("B2B signup error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  if (step === "success") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-10 w-full max-w-md border border-gray-200 text-center">
          <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="w-16 h-16 mx-auto mb-5 rounded-xl object-contain border border-gray-200 p-2" />
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted</h2>
          <p className="text-sm text-gray-600 mb-6">
            Thank you, <strong>{contactName}</strong>! Your request for <strong>{companyName}</strong> has been received.
            We'll review your documents and contact you at <strong>{email}</strong> within 1–2 business days.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-left space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">What happens next?</p>
            <p className="text-xs text-blue-600">1. Our team reviews your application and documents</p>
            <p className="text-xs text-blue-600">2. You'll receive an approval email once verified</p>
            <p className="text-xs text-blue-600">3. Log in with your email OTP to access wholesale pricing</p>
          </div>
          <button
            onClick={() => router.push("/b2b/login")}
            className="w-full py-3 text-white font-semibold rounded-xl text-sm"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 py-10">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg border border-gray-200">
        {/* Header */}
        <div className="text-center mb-7">
          <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="w-16 h-16 mx-auto mb-4 rounded-xl object-contain border border-gray-200 p-2" />
          <div className="flex items-center justify-center gap-2 mb-1">
            <p className="text-lg font-bold" style={{ color: "#1B2A5E" }}>Di Peppi</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded text-white uppercase" style={{ backgroundColor: "#1B2A5E" }}>B2B</span>
          </div>
          <p className="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">Request Trade Access</p>
          <p className="text-sm text-gray-500 mt-2">Fill in your business details. We'll review and approve your account within 1–2 business days.</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg text-sm text-center font-medium" style={{ backgroundColor: "#FAF0F0", color: "#B5535A", border: "1px solid #B5535A33" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Al Nour Trading SAL"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
            />
          </div>

          {/* Contact Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ahmad Khalil"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                Business Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="orders@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                Phone <span className="text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                placeholder="+961 3 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* MOF# + VAT# */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                MOF Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="1234567"
                value={mofNumber}
                onChange={(e) => setMofNumber(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
              />
              <p className="text-xs text-gray-400 mt-1">Ministry of Finance registration</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                VAT Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="LB12345678"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all text-gray-900 placeholder-gray-400 disabled:bg-gray-50"
              />
              <p className="text-xs text-gray-400 mt-1">VAT registration number</p>
            </div>
          </div>

          {/* Document Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Official Business Document <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => !loading && fileInputRef.current?.click()}
              className={`relative w-full border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              } ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="hidden"
                disabled={loading}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl">{file.type === "application/pdf" ? "📄" : "🖼️"}</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-green-700">{file.name}</p>
                    <p className="text-xs text-green-600">{(file.size / 1024 / 1024).toFixed(2)} MB — click to change</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📎</p>
                  <p className="text-sm font-medium text-gray-700">Click to upload document</p>
                  <p className="text-xs text-gray-400 mt-1">Trade license, MOF certificate, or company registration — PDF, JPG, PNG (max 10 MB)</p>
                </div>
              )}
            </div>

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Uploading document...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${uploadProgress}%`, backgroundColor: "#1B2A5E" }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-60 shadow-sm hover:shadow-md"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            {loading
              ? uploadProgress !== null
                ? `Uploading document... ${uploadProgress}%`
                : "Submitting request..."
              : "🏢 Submit Access Request"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-gray-400">
            Already approved?{" "}
            <a href="/b2b/login" className="font-semibold text-blue-600 hover:underline">
              Sign in here
            </a>
          </p>
          <p className="text-xs text-gray-400">
            For retail orders, visit the{" "}
            <a href="/customer/login" className="font-semibold text-blue-600 hover:underline">
              Online Shop
            </a>
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center mt-5">© 2026 Di Peppi. All rights reserved.</p>
      </div>
    </div>
  );
}
