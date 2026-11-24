import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

export default function AppShellLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-dvh pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
