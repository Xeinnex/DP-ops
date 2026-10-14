"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Navigation } from "@/components/navigation";

export function WorkspaceShell({ children, version }: { children: ReactNode; version: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return <div className="min-h-screen">
    <button type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="workspace-sidebar" onClick={() => setOpen(!open)} className="fixed left-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-lime hover:bg-inset">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
    </button>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
    <aside id="workspace-sidebar" hidden={!open} className="fixed inset-y-0 left-0 z-40 w-60 overflow-y-auto border-r border-line bg-panel px-5 pb-5 pt-16">
      <div className="flex min-h-full flex-col">
        <Link href="/" className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime text-inset">DP</span>DP-Ops<span className="text-lime">.</span></Link>
        <div onClick={(event) => { if ((event.target as HTMLElement).closest("a") && window.innerWidth < 768) setOpen(false); }}><Navigation /></div>
        <div className="mt-auto pt-8"><div className="rounded-xl border border-line p-4"><p className="text-sm font-medium">Creative operations</p><p className="mt-2 text-xs text-muted">Local session</p><p className="mt-1 text-xs text-muted">Local workspace · v{version}</p></div></div>
      </div>
    </aside>
    <div className={`min-w-0 ${open ? "md:ml-60" : ""}`}><main className="mx-auto max-w-7xl px-3 pb-8 pt-16 sm:px-6 sm:pb-12 lg:px-10">{children}</main></div>
  </div>;
}
