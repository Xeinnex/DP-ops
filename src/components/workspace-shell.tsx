"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigation } from "@/components/navigation";

export function WorkspaceShell({ children, version }: { children: ReactNode; version: string }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) { menu.current?.close(); return; }
    menu.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  return <div className="min-h-screen">
    <button type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="workspace-sidebar" onClick={() => setOpen(!open)} className="fixed left-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-lime hover:bg-inset">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
    </button>
    <dialog ref={menu} id="workspace-sidebar" aria-label="Main menu" onCancel={(event) => { event.preventDefault(); setOpen(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-panel px-5 pb-5 pt-16 text-ink">
      <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-lg border border-line text-lime"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        <Link href="/" className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime text-inset">DP</span>DP-Ops<span className="text-lime">.</span></Link>
        <div onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}><Navigation /></div>
        <div className="mt-auto pt-8"><div className="rounded-xl border border-line p-4"><p className="text-sm font-medium">Creative operations</p><p className="mt-2 text-xs text-muted">Local session</p><p className="mt-1 text-xs text-muted">Local workspace · v{version}</p></div></div>
      </div>
    </dialog>
    <div className="min-w-0"><main className="mx-auto max-w-7xl px-3 pb-8 pt-16 sm:px-6 sm:pb-12 lg:px-10">{children}</main></div>
  </div>;
}
