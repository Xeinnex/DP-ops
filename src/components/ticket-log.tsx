"use client";
import { useEffect, useState } from "react";
import { today } from "@/lib/daily";
import type { TicketResult } from "@/types/ticket";

interface History {
  detailChecks: { ticketId: string; checkedAt: string; status: string | null; error: string | null }[];
  entries: TicketResult["tickets"];
  statusObservations: { ticketId: string; fetchedAt: string; payload: TicketResult["tickets"][number] }[];
  total: number;
  page: number;
  runs: { id: number; source: string; scope: string; fetchedAt: string; pages: number; payload: TicketResult }[];
}

export function TicketLog() {
  const [day, setDay] = useState(today);
  const [ticketId, setTicketId] = useState("");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ day, ticketId: ticketId.replace(/^#/, ""), page: String(page) });
    fetch(`/api/ticket-log?${params}`, { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setHistory(body); setError(""); }).catch((error) => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [day, ticketId, page]);
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold text-lime">Ticket log</h1><p className="mt-3 text-muted">Raw saved observations, newest first. Expand a fetch to inspect exactly what was returned.</p></div><div className="flex flex-wrap gap-4 rounded-xl border border-line bg-panel p-5"><label className="text-sm text-muted">Activity date<input type="date" value={day} onChange={(event) => { if (event.target.value) { setDay(event.target.value); setPage(1); } }} className="ml-3 rounded-lg border border-line bg-inset p-2 text-ink" /></label><label className="text-sm text-muted">Ticket ID<input value={ticketId} onChange={(event) => { setTicketId(event.target.value); setPage(1); }} placeholder="All tickets" className="ml-3 rounded-lg border border-line bg-inset p-2 text-ink" /></label></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {history && <details className="rounded-xl border border-line bg-panel p-5"><summary className="cursor-pointer font-medium">Daily status decisions · {history.entries.length} work entries</summary><div className="mt-4 space-y-2">{history.entries.map((entry) => <div key={entry.entryId} className="rounded-lg bg-inset p-3 text-sm"><span className="text-blue">#{entry.id} · Entry {entry.occurrence}</span><span className="ml-3">{entry.status} · {Math.round((entry.completion ?? 0) * 100)}% · DT {entry.designTime ?? "Not Set"}</span>{entry.manualCompletion && <span className="ml-3 text-lime">Manually completed</span>}{entry.lockedWip && <span className="ml-3 text-lime">WIP locked today</span>}{entry.reviewFlag && <p className="mt-1 text-xs text-amber-200">{entry.reviewFlag}</p>}</div>)}</div></details>}
    {Boolean(history?.detailChecks.length) && <details className="rounded-xl border border-line bg-panel p-5"><summary className="cursor-pointer font-medium">Missing-ticket status checks</summary><div className="mt-4 space-y-2">{history?.detailChecks.map((check) => <p key={check.ticketId} className="text-sm text-muted">#{check.ticketId} · {new Date(check.checkedAt).toLocaleString()} · {check.status || check.error || "Check claimed"}</p>)}</div></details>}
    {history?.runs.map((run) => <details key={run.id} className="overflow-hidden rounded-xl border border-line bg-panel"><summary className="cursor-pointer p-5"><span className="font-medium">Fetch #{run.id} · {run.source === "manual" ? "Manual ticket" : run.source === "clients" ? "Clients" : `Creative team ${run.scope}`}</span><span className="ml-3 text-sm text-muted">{new Date(run.fetchedAt).toLocaleString()} · {run.payload.tickets.length} tickets · {run.pages} pages</span></summary><div className="border-t border-line p-5"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-muted"><tr>{["ID", "Client", "Title", "Creative", "Status", "DT"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{run.payload.tickets.filter((ticket) => !ticketId || ticket.id === ticketId.replace(/^#/, "")).map((ticket) => <tr key={ticket.id} className="border-t border-line"><td className="p-3"><a className="text-blue" href={ticket.url} target="_blank" rel="noopener noreferrer">#{ticket.id}</a></td><td className="p-3">{ticket.client}</td><td className="p-3">{ticket.title}</td><td className="p-3">{ticket.assignee}</td><td className="p-3">{ticket.status}</td><td className="p-3 text-lime">{ticket.designTime ?? "Not Set"}</td></tr>)}</tbody></table></div><details className="mt-4"><summary className="cursor-pointer text-sm text-blue">Raw JSON · entire fetch</summary><pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-inset p-4 text-xs text-muted">{JSON.stringify(run.payload, null, 2)}</pre></details></div></details>)}
    {Boolean(history?.statusObservations.length) && <details className="rounded-xl border border-line bg-panel p-5"><summary className="cursor-pointer font-medium">Saved detail-page observations</summary><pre className="mt-3 max-h-96 overflow-auto text-xs text-muted">{JSON.stringify(history?.statusObservations, null, 2)}</pre></details>}
    {ticketId && <p className="text-xs text-muted">Showing fetches from sources that observed this ticket. A fetch with no matching row means the ticket was absent; expand its raw JSON to verify.</p>}
    {history && !history.runs.length && <p className="text-muted">No saved observations match this date and ticket.</p>}
    {history && <div className="flex items-center gap-4 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Previous</button><span className="text-muted">Page {page} · {history.total} fetches</span><button disabled={page * 20 >= history.total} onClick={() => setPage(page + 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Next</button></div>}
    <p className="text-xs text-muted">Absence from a later fetch does not prove delivery. Unfiltered fetches include empty queues. Daily work stays retained; status changes are shown only when observed. Raw history is never rewritten when assignments or DT change.</p>
  </div>;
}
