"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, writeBatch, doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Notification {
  id: string;
  orderId: string;
  orderName: string;
  prevStatus: string;
  newStatus: string;
  message: string;
  read: boolean;
  createdAt: any;
}

const STATUS_ICONS: Record<string, string> = {
  Confirmed:    "✓",
  Preparing:    "🐟",
  "To Deliver": "🚚",
  Delivered:    "✓",
  Cancelled:    "✕",
};

function timeAgo(val: any) {
  if (!val) return "";
  const ms = val?.seconds ? val.seconds * 1000 : new Date(val).getTime();
  if (!ms || isNaN(ms)) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");
      if (raw) setUserId(JSON.parse(raw).userId || null);
    } catch {}
  }, []);

  // Real-time listener on /notifications for this user
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, () => { /* ignore permission errors silently */ });
    return () => unsub();
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (pathname === "/customer/login") return null;

  const unread = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    const unreadItems = notifications.filter(n => !n.read);
    if (!unreadItems.length) return;
    const batch = writeBatch(db);
    unreadItems.forEach(n => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit().catch(() => {});
  };

  const handleToggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    // Mark as read 1.5s after opening
    if (willOpen && unread > 0) setTimeout(markAllRead, 1500);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell size={20} style={{ color: "#1B2A5E" }} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-[58px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-[60] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl mb-2">🔔</p>
              <p className="text-sm text-gray-400">No notifications yet</p>
              <p className="text-xs text-gray-300 mt-1">Order updates will appear here</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 transition-colors ${n.read ? "bg-white" : "bg-blue-50"}`}
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">
                    {STATUS_ICONS[n.newStatus] || "📦"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">
                      {n.message.replace(/\*/g, "")}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
