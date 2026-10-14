"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["/", "Dashboard", "▥"], ["/tickets", "Client tickets", "▤"], ["/creative-tickets", "Creative tickets", "◇"], ["/ticket-log", "Ticket log", "≡"], ["/clients", "Clients DB", "◎"], ["/creatives", "Creatives DB", "◉"]];

export function Navigation() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="flex flex-col gap-2">
    {links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href || (href === "/" && pathname === "/dashboard") ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${pathname === href || (href === "/" && pathname === "/dashboard") ? "bg-lime/10 text-lime" : "text-muted hover:bg-canvas hover:text-ink"}`}><span aria-hidden>{icon}</span>{label}</Link>)}
  </nav>;
}
