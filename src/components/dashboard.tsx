"use client";

import { useEffect, useState } from "react";
import type { DailyData } from "@/types/operations";
import { today, normalizeName, signedTime } from "@/lib/daily";
import type { Ticket } from "@/types/ticket";
import { creativeWork } from "@/lib/creative-work";
import { countedMinutes, completedMinutes, scopeRank, statusKey } from "@/lib/ticket-status";
import { ManualTicketForm } from "@/components/manual-ticket-form";
import { DesignTimeEditor } from "@/components/design-time-editor";
import { CreativeSummary } from "@/components/creative-summary";
import { QueueLink } from "@/components/queue-link";
import { clientTicketsUrl, creativeTicketsUrl } from "@/lib/queue-links";

export function Dashboard() {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DailyData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState("");
  const [working, setWorking] = useState(false);
  const [adding, setAdding] = useState(false);

  async function refreshBoth() {
    setRefreshing(true); setError(""); setProgress("Refreshing queues and checking missing statuses…");
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body.data);
      setProgress(body.warnings.length ? body.warnings.join(" ") : "Queues updated.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Refresh failed."); setProgress("");
      const response = await fetch(`/api/dashboard?day=${day}`).catch(() => null);
      if (response?.ok) setData(await response.json());
    } finally { setRefreshing(false); }
  }

  async function updateWork(ticket: Ticket, completion: boolean) {
    setWorking(true); setError("");
    try {
      const body = completion ? { day, entryId: ticket.entryId, complete: !ticket.manualCompletion }
        : { day, ticketId: ticket.entryId || ticket.id, assignee: ticket.assignee, worked: !ticket.worked };
      const response = await fetch(completion ? "/api/completion" : "/api/worked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update work."); }
    finally { setWorking(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?day=${day}`, { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); setError(""); }).catch((error) => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [day]);

  const sum = (tickets: Ticket[]) => tickets.reduce((total, ticket) => total + countedMinutes(ticket), 0);
  const completed = (tickets: Ticket[]) => Math.round(tickets.reduce((total, ticket) => total + completedMinutes(ticket), 0));
  const assigned = (ticket: Ticket) => Boolean(ticket.assignee) && !/^(not assigned|unassigned|none)$/i.test(ticket.assignee);
  const clientRows = data?.clients.map((client) => {
    const tickets = data.tickets.filter((ticket) => ticket.clientId ? ticket.clientId === client.id || ticket.clientId === client.companyId : normalizeName(ticket.client) === normalizeName(client.name));
    return { client, tickets, allocated: sum(tickets.filter(assigned)), complete: completed(tickets.filter(assigned)) };
  }).sort((a, b) => Number(b.tickets.length > 0) - Number(a.tickets.length > 0) || a.client.name.localeCompare(b.client.name)) ?? [];
  const clarifications = data?.tickets.filter((ticket) => statusKey(ticket.status) === "customer_clarification") ?? [];
  const lastFetch = data?.fetched.filter((run) => run.source === "clients" || run.scope === "347").map((run) => run.fetchedAt).sort().at(-1);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div className="flex items-baseline gap-4"><h1 className="text-2xl font-semibold text-lime">Dashboard</h1><span className="text-xs text-muted">{lastFetch ? `Updated ${new Date(lastFetch).toLocaleTimeString()}` : "No saved activity"}</span></div>
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted">Date<input type="date" disabled={refreshing || working || adding} value={day} onChange={(event) => { if (event.target.value) { setDay(event.target.value); setData(null); setProgress(""); } }} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink" /></label>{data && day === today() && !adding && <button disabled={refreshing || working} onClick={() => setAdding(true)} className="rounded-lg border border-blue/50 px-3 py-2 text-sm text-blue">+ Add missed ticket</button>}<button disabled={refreshing || working || adding || day !== today()} onClick={refreshBoth} className="rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-inset disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh both queues ↻"}</button></div>
    </header>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {progress && <p aria-live="polite" className="text-xs text-muted">{progress}</p>}
    {!data && !error && <p className="text-muted">Loading saved activity…</p>}
    {data && adding && day === today() && <ManualTicketForm creatives={data.creatives} onCancel={() => setAdding(false)} onSaved={(saved) => { setData(saved); setDay(saved.day); setAdding(false); setProgress("Manual ticket saved for today."); }} />}
    {data && <>
      <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Creative bandwidth</h2><div className="flex gap-4 text-xs text-muted"><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue" />Assigned DT</span><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-lime" />Completed DT</span></div></div>
        <div className="grid gap-4 lg:grid-cols-2">{[...data.creatives].sort((a, b) => scopeRank(a) - scopeRank(b) || a.alias.localeCompare(b.alias)).map((creative) => {
          const tickets = creativeWork(data.tickets, data.workedTickets, creative.name).filter((ticket) => statusKey(ticket.status) !== "customer_clarification");
          const used = sum(tickets);
          const done = completed(tickets);
          const percent = Math.round(used / creative.capacityMinutes * 100);
          const donePercent = Math.round(done / creative.capacityMinutes * 100);
          const available = creative.capacityMinutes - used;
          const allDone = used > 0 && tickets.reduce((total, ticket) => total + completedMinutes(ticket), 0) >= used;
          const overloaded = used > creative.capacityMinutes;
          const previous = data.previousProgress?.find((progress) => progress.creativeId === creative.id);
          const changed = previous && (previous.assignedMinutes !== used || previous.completedMinutes !== done || previous.capacityMinutes !== creative.capacityMinutes);
          return <details key={creative.id} className={`overflow-hidden rounded-xl border ${overloaded ? "border-red-400/30 bg-red-400/5" : allDone ? "border-lime/30 bg-lime/5" : "border-line bg-panel"}`}>
            <summary className="cursor-pointer list-none px-5 py-4">
              <CreativeSummary alias={creative.alias}>
                <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-lime"><QueueLink href={creativeTicketsUrl(creative.designerId)}>{creative.alias}</QueueLink></h3><p className="mt-1 text-xs text-muted">{creative.scopes.join(" + ") || "No scopes"} · {tickets.length} tickets</p></div><div className="text-right"><p className={available < 0 ? "text-red-300" : "text-ink"}>{signedTime(available)} left</p><p className="mt-1 text-xs text-muted">{percent}% assigned · {donePercent}% complete</p></div></div>
                <div aria-hidden={!changed} className={`relative mt-2 h-1 overflow-hidden rounded-full bg-inset ${changed ? "visible" : "invisible"}`} aria-label={`${creative.alias} previous refresh`} title={previous ? `Previous refresh: ${signedTime(previous.assignedMinutes)} assigned · ${signedTime(previous.completedMinutes)} completed` : undefined}><div className="absolute inset-y-0 left-0 bg-blue/50" style={{ width: `${previous ? Math.min(previous.assignedMinutes / previous.capacityMinutes * 100, 100) : 0}%` }} /><div className="absolute inset-y-0 left-0 bg-lime/50" style={{ width: `${previous ? Math.min(previous.completedMinutes / previous.capacityMinutes * 100, 100) : 0}%` }} /></div>
                <div role="progressbar" aria-label={`${creative.alias} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(donePercent, 100)} aria-valuetext={`${signedTime(done)} completed of ${signedTime(creative.capacityMinutes)} capacity; ${signedTime(used)} assigned`} className="relative mt-1 h-3 overflow-hidden rounded-full bg-inset"><div className="absolute inset-y-0 left-0 bg-blue" style={{ width: `${Math.min(percent, 100)}%` }} /><div className="absolute inset-y-0 left-0 bg-lime" style={{ width: `${Math.min(donePercent, 100)}%` }} /></div>
                <div className="mt-2 flex justify-between gap-2 text-xs text-muted"><span>{signedTime(used)} assigned · <span className="text-lime">{signedTime(done)} completed</span></span><span>Queue ↓</span></div>
              </CreativeSummary>
            </summary>
            <div className="space-y-3 border-t border-line p-5">{tickets.map((ticket) => <div key={ticket.entryId || ticket.id} className={`rounded-lg border p-3 text-sm ${ticket.reviewFlag || statusKey(ticket.status) === "canceled" ? "border-amber-400/40 bg-amber-400/5" : "border-transparent bg-inset"}`}>
              <div className="flex justify-between gap-4"><a href={ticket.url} target="_blank" rel="noopener noreferrer"><p className="text-blue">#{ticket.id}{(ticket.occurrence ?? 1) > 1 ? ` · Revision ${(ticket.occurrence ?? 1) - 1}` : ""} · {ticket.title}</p><p className="mt-1 text-xs text-muted">{ticket.client} · {ticket.status} · {Math.round((ticket.completion ?? 0) * 100)}%</p></a><span className="shrink-0 font-mono text-lime">{signedTime(countedMinutes(ticket))}</span></div>
              {ticket.reviewFlag && <p className="mt-2 text-xs text-amber-200">{ticket.reviewFlag}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">{ticket.manuallyAdded && <span className="text-xs text-blue">Manually added</span>}{ticket.retained && <span className="text-xs text-muted">Retained daily work</span>}{ticket.lockedWip && <span className="text-xs text-lime">WIP complete · locked today</span>}
                <button disabled={working || refreshing || !ticket.entryId || !data.tickets.some((entry) => entry.entryId === ticket.entryId && normalizeName(entry.assignee) === normalizeName(ticket.assignee))} onClick={() => updateWork(ticket, true)} className="rounded-md border border-lime/30 px-2 py-1 text-xs text-lime disabled:opacity-40">{ticket.manualCompletion ? "Undo completion" : "Mark complete"}</button>
                <button disabled={working || refreshing} onClick={() => updateWork(ticket, false)} className="rounded-md border border-line px-2 py-1 text-xs text-muted">{ticket.worked ? "Worked · undo" : "Mark worked"}</button>
                <DesignTimeEditor ticket={ticket} day={day} disabled={working || refreshing || !ticket.entryId || !data.tickets.some((entry) => entry.entryId === ticket.entryId && normalizeName(entry.assignee) === normalizeName(ticket.assignee))} onBusy={setWorking} onSaved={setData} />
                {ticket.dtLocked && <span className="text-xs text-muted">DT locked</span>}{ticket.manualDesignTime && <span className="text-xs text-blue">DT manually edited</span>}
              </div>
            </div>)}{!tickets.length && <p className="text-sm text-muted">No work saved for this day.</p>}</div>
          </details>;
        })}</div>
      </section>
      <section className="rounded-xl border border-blue/30 bg-panel p-5"><h2 className="text-lg font-semibold">Customer clarification <span className="text-sm text-muted">({clarifications.length})</span></h2><div className="mt-3 space-y-2">{clarifications.map((ticket) => <a key={ticket.entryId || ticket.id} href={ticket.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-inset p-3 text-sm"><span className="text-blue">#{ticket.id} · {ticket.title}</span><span className="ml-3 text-muted">{ticket.client} · 0:00 DT</span></a>)}{!clarifications.length && <p className="text-sm text-muted">No tickets awaiting customer clarification.</p>}</div></section>
      <section className="rounded-xl border border-line bg-panel p-5"><h2 className="text-lg font-semibold">Clients with no assigned DT</h2><div className="mt-4 space-y-3">{clientRows.filter((row) => row.tickets.length && row.allocated === 0).map(({ client, tickets }) => <details key={client.id} className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4"><summary className="cursor-pointer text-sm"><QueueLink href={clientTicketsUrl(client.companyId || client.id)} className="font-medium">{client.name}</QueueLink><span className="ml-3 text-muted">{tickets.length} tickets · 0:00 / {signedTime(client.dailyMinutes)} · {client.pc}</span></summary><div className="mt-3 space-y-2">{tickets.map((ticket) => <a className="block text-sm text-blue" href={ticket.url} key={ticket.entryId || ticket.id} target="_blank" rel="noopener noreferrer">#{ticket.id} · {ticket.title}</a>)}</div></details>)}{!clientRows.some((row) => row.tickets.length && row.allocated === 0) && <p className="text-sm text-muted">No clients with queued tickets and zero assigned DT.</p>}</div></section>
      <section className="overflow-hidden rounded-xl border border-line bg-panel"><h2 className="p-5 text-lg font-semibold">Daily client allocation</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-inset text-muted"><tr>{["Client", "Daily status", "Subscription", "Assigned DT", "Completed DT", "Daily DT", "Available DT"].map((title) => <th key={title} className="px-5 py-3">{title}</th>)}</tr></thead><tbody>{clientRows.map(({ client, tickets, allocated, complete }) => {
        const empty = tickets.length === 0;
        const maximized = !empty && client.dailyMinutes > 0 && allocated >= client.dailyMinutes;
        const fulfilled = !empty && client.dailyMinutes > 0 && complete >= client.dailyMinutes;
        const unassigned = !empty && allocated === 0;
        const rowColor = empty ? "text-[#505050] [&>td]:text-[#505050]" : fulfilled ? "bg-lime/10" : maximized ? "bg-blue/10" : unassigned ? "bg-yellow-400/10" : "";
        const statusColor = empty ? "text-muted" : fulfilled ? "text-lime" : maximized ? "text-blue" : unassigned ? "text-yellow-300" : "text-muted";
        const label = empty ? "No tickets today" : fulfilled ? "Daily DT completed" : maximized ? "Utilization maximized" : unassigned ? "No assigned DT" : "Partially assigned";
        return <tr key={client.id} className={`border-t border-line ${rowColor}`}>
          <td className="px-5 py-3"><QueueLink href={clientTicketsUrl(client.companyId || client.id)}>{client.name}</QueueLink></td>
          <td className={`px-5 py-3 text-xs ${statusColor}`}>{label}</td>
          <td className="px-5 py-3 text-muted">{client.pc}</td>
          <td className={`px-5 py-3 ${empty ? "text-muted" : "text-blue"}`}>{signedTime(allocated)}</td>
          <td className={`px-5 py-3 ${empty ? "text-muted" : "text-lime"}`}>{signedTime(complete)}</td>
          <td className="px-5 py-3">{signedTime(client.dailyMinutes)}</td>
          <td className={`px-5 py-3 ${!empty && allocated > client.dailyMinutes ? "text-red-300" : "text-muted"}`}>{signedTime(client.dailyMinutes - allocated)}</td>
        </tr>;
      })}</tbody></table></div></section>
    </>}
  </div>;
}
