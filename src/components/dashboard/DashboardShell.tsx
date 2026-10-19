"use client";

import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";

interface DashboardShellProps {
  children: React.ReactNode;
  userEmail?: string | null;
  storeSlug?: string | null;
}

export default function DashboardShell({
  children,
  userEmail,
  storeSlug,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-950 font-sans selection:bg-[#2563EB] selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        userEmail={userEmail}
        storeSlug={storeSlug}
      />

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <TopBar onOpenMobile={() => setMobileOpen(true)} storeSlug={storeSlug} />

        {/* Dynamic Route Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
