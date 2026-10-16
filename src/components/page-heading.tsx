import type { ReactNode } from "react";

export function PageHeading({ title, updated }: { title: string; updated?: ReactNode }) {
  return <div className="fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-canvas pl-16 pr-3 sm:gap-4 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-0">
    <h1 className="text-base font-semibold text-lime sm:text-2xl">{title}</h1>
    {updated && <span className="text-[10px] text-muted sm:text-xs">{updated}</span>}
  </div>;
}
