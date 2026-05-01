"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CustomerHomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/customer/products");
  }, [router]);
  return null;
}
