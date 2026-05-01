"use client";

import { useEffect, useState } from "react";

export type SessionRole = "Admin" | "Employee" | "Customer" | null;

export interface Session {
  userId: string;
  email: string;
  role: SessionRole;
  accountType: string;
  name: string;
}

/** Read the session stored in localStorage and parse it. */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("session");
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** React hook: returns { session, loading }. loading is true only on the first render
 *  while localStorage is being read (avoids flash-of-unauthenticated-content). */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setLoading(false);
  }, []);

  return { session, loading };
}

/** True if the session belongs to an admin or employee (non-customer). */
export function isAdminSession(session: Session | null) {
  if (!session) return false;
  return (
    session.role === "Admin" ||
    session.accountType === "admin" ||
    session.role === "Employee" ||
    session.accountType === "employee"
  );
}

/** True only if the role is explicitly Admin. */
export function isStrictAdminSession(session: Session | null) {
  if (!session) return false;
  return session.role === "Admin" || session.accountType === "admin";
}
