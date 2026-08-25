import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";

function AppLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-900">
      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />

      <div className="min-h-screen md:pl-[18rem]">
        <AppHeader onOpenNavigation={() => setNavigationOpen(true)} />
        <main className="relative min-h-[calc(100vh-4.75rem)] overflow-hidden">
          <div className="pointer-events-none absolute right-[-7rem] top-20 h-96 w-96 rounded-full border-[4rem] border-emerald-900/[0.025]" />
          <div className="relative">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
