import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="relative flex h-full overflow-hidden bg-slate-100 dark:bg-[#090b10]">
      {/* Modern Ambient Golden Glow Lights with Hardware Acceleration */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-48 right-1/4 h-[450px] w-[450px] rounded-full bg-amber-500/10 blur-[80px] dark:bg-amber-500/15 transform-gpu will-change-transform"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-[-100px] left-64 h-[300px] w-[300px] rounded-full bg-yellow-500/5 blur-[60px] dark:bg-amber-600/10 transform-gpu will-change-transform"
      />

      <Sidebar />
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          {title}
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {actions}
    </header>
  );
}
