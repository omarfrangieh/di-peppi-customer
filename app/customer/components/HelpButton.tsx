"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const SUPPORT_PHONE = "+96171521714";
const SUPPORT_PHONE_DISPLAY = "+961 71 521 714";
const WHATSAPP_URL = `https://wa.me/96171521714`;

export default function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Hide on login, checkout and cart pages
  if (
    pathname === "/customer/login" ||
    pathname === "/customer/checkout" ||
    pathname === "/customer/cart"
  ) return null;

  return (
    <>
      {/* Floating button — sits above BottomTabBar on mobile (bottom-20), bottom-6 on desktop */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Support"
        className="fixed bottom-24 right-4 md:bottom-8 md:right-6 z-50 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-2xl shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
        style={{ backgroundColor: "#1B2A5E" }}
      >
        <span className="text-xl leading-none">🎧</span>
        <span className="text-white text-[10px] font-semibold tracking-wide leading-none">Support</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setOpen(false)}
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
              🎧
            </div>

            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Support</h2>
            <p className="text-sm text-gray-500 text-center mb-5">
              Having trouble with your order or need assistance? We're here to help.
            </p>

            {/* Contact options */}
            <div className="space-y-3 mb-5">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="text-xl">💬</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">WhatsApp</p>
                  <p className="text-xs text-gray-400">Chat with us — fastest response</p>
                </div>
              </a>

              <a
                href={`tel:${SUPPORT_PHONE}`}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="text-xl">📞</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Call Us</p>
                  <p className="text-xs text-gray-400">{SUPPORT_PHONE_DISPLAY}</p>
                </div>
              </a>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors cursor-pointer text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
