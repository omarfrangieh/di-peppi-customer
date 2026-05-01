"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import B2BHeader from "./components/B2BHeader";

export default function B2BLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/b2b/login") return;
    const session = localStorage.getItem("b2b-session");
    if (!session) {
      router.push("/b2b/login");
    }
  }, [router, pathname]);

  return (
    <>
      <B2BHeader />
      {children}
    </>
  );
}
