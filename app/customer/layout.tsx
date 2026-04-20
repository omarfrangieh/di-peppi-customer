"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("session");
    if (!session) {
      router.push("/customer/login");
    }
  }, [router]);

  return <>{children}</>;
}
