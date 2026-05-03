"use client";

import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface Session {
  userId: string;
  email: string;
  role: "Admin" | "Manager" | "Operator" | "Driver" | "Warehouse Lead";
  accountType: "Employee" | "Customer" | "Supplier";
  name: string;
}

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthWrapper");
  }
  return context;
}

export default function AuthWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isLoginPage = pathname === "/login" || pathname === "/admin/login" || pathname === "/customer/login" || pathname === "/b2b/login" || pathname === "/customer/signup" || pathname === "/b2b/signup";
  const publicPages = ["/login", "/admin/login", "/customer/login", "/b2b/login", "/customer/signup", "/b2b/signup"];

  const getLoginRedirect = () => {
    if (pathname.startsWith("/customer")) return "/customer/login";
    if (pathname.startsWith("/b2b")) return "/b2b/login";
    return "/admin/login";
  };

  useEffect(() => {
    let unsubscribe: any = null;

    const initializeAuth = async () => {
      // Wait for Firebase Auth to finish restoring its session
      const firebaseUser = await new Promise<any>((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
          unsub();
          resolve(user);
        });
      });

      const sessionStr = localStorage.getItem("session");

      if (firebaseUser && sessionStr) {
        // Firebase Auth active + local session = fully authenticated
        try {
          setSession(JSON.parse(sessionStr));
        } catch {
          localStorage.removeItem("session");
        }
      } else if (!isLoginPage) {
        // No Firebase Auth session — clear stale local session and redirect to login
        localStorage.removeItem("session");
        localStorage.removeItem("customToken");
        await signOut(auth).catch(() => {});
        router.push(getLoginRedirect());
        setLoading(false);
        return;
      }

      unsubscribe = onAuthStateChanged(auth, (user) => {
        setLoading(false);
        // If Firebase loses the auth session after we were logged in, redirect to login
        if (!user && !isLoginPage) {
          localStorage.removeItem("session");
          localStorage.removeItem("customToken");
          router.push(getLoginRedirect());
        }
      });
    };

    initializeAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isLoginPage, router]);

  const logout = async () => {
    await signOut(auth).catch(() => {});
    localStorage.removeItem("session");
    setSession(null);
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !publicPages.includes(pathname)) {
    return null;
  }

  return (
    <AuthContext.Provider value={{session, loading: false, logout}}>
      {children}
    </AuthContext.Provider>
  );
}
