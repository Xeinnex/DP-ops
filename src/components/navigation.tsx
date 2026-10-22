"use client";
import { teamFetch } from "@/lib/team-fetch";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [["/", "Dashboard", "▥"], ["/tickets", "Client tickets", "▤"], ["/creative-tickets", "Creative tickets", "◇"], ["/ticket-log", "Ticket log", "≡"], ["/clients", "Clients DB", "◎"], ["/creatives", "Creatives DB", "◉"]];

export function Navigation() {
  const pathname = usePathname();
  const [reporting, setReporting] = useState(false);
  const [reportResult, setReportResult] = useState("");
  const [reportError, setReportError] = useState("");
  async function sendPcReport() {
    setReporting(true); setReportResult(""); setReportError("");
    try {
      const response = await teamFetch("/api/report", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send PC report.");
      setReportResult(`Sent to Google Chat: ${result.ticketCount} tickets, ${result.clientCount} clients.`);
    } catch (error) { setReportError(error instanceof Error ? error.message : "Unable to send PC report."); }
    finally { setReporting(false); }
  }
  return <nav aria-label="Main navigation" className="flex flex-col gap-2">
    {links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href || (href === "/" && pathname === "/dashboard") ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${pathname === href || (href === "/" && pathname === "/dashboard") ? "bg-lime/10 text-lime" : "text-muted hover:bg-canvas hover:text-ink"}`}><span aria-hidden>{icon}</span>{label}</Link>)}
    <div role="group" aria-label="Reports" className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={sendPcReport} disabled={reporting} title="Send today's PC and PC AD tickets to Google Chat" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"><span aria-hidden>📤</span>{reporting ? "Sending PC report…" : "PC report"}</button>
      {reportResult && <p role="status" className="px-4 py-2 text-xs text-lime">{reportResult}</p>}
      {reportError && <p role="alert" className="px-4 py-2 text-xs text-red-300">{reportError}</p>}
    </div>
  </nav>;
}
