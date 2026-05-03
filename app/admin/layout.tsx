import Sidebar from "@/components/Sidebar";
import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
