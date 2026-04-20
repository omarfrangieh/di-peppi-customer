import Sidebar from "@/components/Sidebar";
import { ReactNode } from "react";

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen min-w-0">{children}</main>
    </div>
  );
}
