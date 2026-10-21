"use client";

import { useEffect, useState } from "react";
import type { DailyData } from "@/types/operations";
import { today, normalizeName, signedTime } from "@/lib/daily";
import type { Ticket } from "@/types/ticket";
import { creativeWork } from "@/lib/creative-work";
import { countedMinutes, completedMinutes, scopeRank, statusKey } from "@/lib/ticket-status";
import { ManualTicketForm } from "@/components/manual-ticket-form";
import { DesignTimeEditor } from "@/components/design-time-editor";
import { ScopeBadges } from "@/components/scope-badges";
import { PageHeading } from "@/components/page-heading";
import { CreativeSummary } from "@/components/creative-summary";
import { QueueLink } from "@/components/queue-link";
import { clientTicketsUrl, creativeTicketsUrl } from "@/lib/queue-links";
import { availabilityOptions, effectiveCapacity, capacityPercent } from "@/lib/availability";
import type { CreativeAvailability } from "@/types/operations";
import { outsideTeam, outsideStatuses, simplifiedStatus, type OutsideStatus } from "@/lib/outside-tickets";
import { compareClientAllocation, lastActiveLabel } from "@/lib/client-activity";
import { waitingAssignments } from "@/lib/waiting-assignments";
import { designTimeMinutes } from "@/lib/design-time";

export function Dashboard() {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DailyData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState("");
  const [working, setWorking] = useState(false);
  const [adding, setAdding] = useState(false);

  async function removeCreativeEntry(ticket: Ticket, action: "delete" | "restore" = "delete") {
    if (action === "delete" && !window.confirm("Remove this card from this creative daily dashboard? Raw ticket history is kept.")) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/creative-entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, entryId: ticket.entryId, assignee: ticket.assignee, action }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to remove card."); }
    finally { setWorking(false); }
  }

  async function updateOutsideStatus(ticket: Ticket, status: OutsideStatus | null) {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/outside-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, entryId: ticket.entryId, status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update ticket status."); }
    finally { setWorking(false); }
  }

  async function updateAvailability(creativeId: string, availability: CreativeAvailability) {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creativeId, availability }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body); setDay(body.day);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update availability."); }
    finally { setWorking(false); }
  }

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

  async function updateTicketControl(ticket: Ticket, action: "delivery" | "bandwidth") {
    setWorking(true); setError("");
    try {
      const enabled = action === "delivery" ? simplifiedStatus(ticket) !== "Delivered" : !ticket.noBandwidth;
      const body = { day, entryId: ticket.entryId, action, enabled };
      const response = await fetch("/api/ticket-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    return { client, tickets, lastActiveDay: data.clientActivity?.[client.id], allocated: sum(tickets.filter(assigned)), complete: completed(tickets.filter(assigned)) };
  }).sort(compareClientAllocation) ?? [];
  const waitingRows = data ? waitingAssignments(data.clients, data.tickets) : [];
  const clarifications = data?.tickets.filter((ticket) => statusKey(ticket.status) === "customer_clarification") ?? [];
  const outsideTickets = data?.tickets.filter((ticket) => outsideTeam(ticket, data.creatives) && !["canceled", "customer_clarification", "draft", "inactive"].includes(statusKey(ticket.status))).sort((a, b) => a.client.localeCompare(b.client, undefined, { sensitivity: "base" })) ?? [];
  const lastFetch = data?.fetched.filter((run) => run.source === "clients" || run.scope === "347").map((run) => run.fetchedAt).sort().at(-1);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <PageHeading title="Dashboard" updated={lastFetch ? `Updated ${new Date(lastFetch).toLocaleTimeString()}` : "No saved activity"} />
      <div className="dashboard-controls flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted">Date<input type="date" disabled={refreshing || working || adding} value={day} onChange={(event) => { if (event.target.value) { setDay(event.target.value); setData(null); setProgress(""); } }} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink" /></label>{data && day === today() && !adding && <button disabled={refreshing || working} onClick={() => setAdding(true)} className="rounded-lg border border-blue/50 px-3 py-2 text-sm text-blue">+ Add missed ticket</button>}<button disabled={refreshing || working || adding || day !== today()} onClick={refreshBoth} className="rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-inset disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh both queues ↻"}</button></div>
    </header>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {progress && <p aria-live="polite" className="text-xs text-muted">{progress}</p>}
    {!data && !error && <p className="text-muted">Loading saved activity…</p>}
    {data && adding && day === today() && <ManualTicketForm creatives={data.creatives} onCancel={() => setAdding(false)} onSaved={(saved) => { setData(saved); setDay(saved.day); setAdding(false); setProgress("Manual ticket saved for today."); }} />}
    {data && <>
      <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Creative bandwidth</h2><div className="flex gap-4 text-xs text-muted"><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue" />Assigned DT</span><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-lime" />Completed DT</span></div></div>
        <div className="grid gap-4 lg:grid-cols-2">{[...data.creatives].sort((a, b) => scopeRank(a) - scopeRank(b) || a.alias.localeCompare(b.alias)).map((creative) => {
          const tickets = creativeWork(data.tickets, data.workedTickets, creative.name).sort((a, b) => outsideStatuses.indexOf(simplifiedStatus(a)) - outsideStatuses.indexOf(simplifiedStatus(b)));
          const used = sum(tickets);
          const done = completed(tickets);
          const capacity = effectiveCapacity(creative);
          const availability = availabilityOptions.find((option) => option.value === creative.availability) || availabilityOptions[0];
          const percent = capacityPercent(used, capacity);
          const donePercent = capacityPercent(done, capacity);
          const available = capacity - used;
          const allDone = used > 0 && tickets.reduce((total, ticket) => total + completedMinutes(ticket), 0) >= used;
          const overloaded = used > capacity;
          const awayWithTickets = creative.availability === "away" && tickets.some((ticket) => !ticket.referenceOnly && !ticket.noBandwidth && statusKey(ticket.status) !== "canceled");
          const previous = data.previousProgress?.find((progress) => progress.creativeId === creative.id);
          const changed = previous && (previous.assignedMinutes !== used || previous.completedMinutes !== done || previous.capacityMinutes !== capacity);
          return <div key={creative.id} className="relative self-start"><details className={`overflow-hidden rounded-xl border ${allDone ? "border-lime/30 bg-lime/5" : awayWithTickets ? "border-red-500/70 bg-red-500/25" : overloaded ? "border-red-400/30 bg-red-400/5" : "border-line bg-panel"}`}>
            <summary className="cursor-pointer list-none px-3 py-3 sm:px-5">
              <CreativeSummary alias={creative.alias} availability={availability.value}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className={`text-sm font-semibold sm:text-base ${availability.value === "away" ? "text-red-500" : availability.value === "half_day" ? "text-yellow-400" : "text-lime"}`}><QueueLink href={creativeTicketsUrl(creative.designerId)}>{creative.alias}</QueueLink>{availability.value !== "available" && <span className={`ml-1 text-[9px] font-medium ${availability.value === "away" ? "text-red-300" : "text-yellow-300"}`}>{availability.value === "half_day" ? "Half day" : "Away"}</span>}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><ScopeBadges scopes={creative.scopes} /><span className="text-[10px] text-muted">{tickets.length} tickets</span></div></div><p className={`shrink-0 text-right text-xs sm:text-sm ${available < 0 ? "text-red-300" : "text-ink"}`}>{signedTime(available)} left</p></div>
                <div aria-hidden={!changed} className={`relative mt-2 h-1 overflow-hidden rounded-full bg-inset ${changed ? "visible" : "invisible"}`} aria-label={`${creative.alias} previous refresh`} title={previous ? `Previous refresh: ${signedTime(previous.assignedMinutes)} assigned · ${signedTime(previous.completedMinutes)} completed` : undefined}><div className="absolute inset-y-0 left-0 bg-blue/50" style={{ width: `${previous ? Math.min(capacityPercent(previous.assignedMinutes, previous.capacityMinutes), 100) : 0}%` }} /><div className="absolute inset-y-0 left-0 bg-lime/50" style={{ width: `${previous ? Math.min(capacityPercent(previous.completedMinutes, previous.capacityMinutes), 100) : 0}%` }} /></div>
                <div role="progressbar" aria-label={`${creative.alias} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(donePercent, 100)} aria-valuetext={`${signedTime(done)} completed of ${signedTime(capacity)} capacity; ${signedTime(used)} assigned`} className="relative mt-1 h-3 overflow-hidden rounded-full bg-inset"><div className="absolute inset-y-0 left-0 bg-blue" style={{ width: `${Math.min(percent, 100)}%` }} /><div className="absolute inset-y-0 left-0 bg-lime" style={{ width: `${Math.min(donePercent, 100)}%` }} /></div>
                <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-muted sm:text-xs"><span>{signedTime(used)} assigned</span><span>Queue ↓</span></div>
              </CreativeSummary>
            </summary>
            <div className="space-y-1.5 border-t border-line p-4">
              <div className="flex flex-wrap gap-2" aria-label={`${creative.alias} availability`}>{availabilityOptions.map((option) => <button type="button" key={option.value} aria-pressed={availability.value === option.value} disabled={working || refreshing || day !== today()} onClick={() => updateAvailability(creative.id, option.value)} className={`rounded-md px-2 py-0.5 text-[10px] font-bold disabled:opacity-40 ${option.className} ${availability.value === option.value ? "ring-1 ring-white/60" : "opacity-60 hover:opacity-100"}`}>{option.label}</button>)}</div>
              {tickets.map((ticket) => {
                const status = simplifiedStatus(ticket);
                const canceled = statusKey(ticket.status) === "canceled";
                const client = data.clients.find((client) => ticket.clientId ? client.id === ticket.clientId || client.companyId === ticket.clientId : normalizeName(client.name) === normalizeName(ticket.client));
                const editable = !ticket.referenceOnly && Boolean(ticket.entryId && data.tickets.some((entry) => entry.entryId === ticket.entryId && normalizeName(entry.assignee) === normalizeName(ticket.assignee)));
                const tint = ticket.referenceOnly ? "border-red-400/30 bg-red-400/10" : canceled ? "border-red-400/30 bg-red-400/5" : status === "Delivered" ? "border-transparent bg-lime/10" : status === "In Progress" ? "border-transparent bg-yellow-400/10" : "border-transparent bg-inset";
                const tag = status === "Delivered" ? "bg-lime/15 text-lime" : status === "In Progress" ? "bg-yellow-400/15 text-yellow-300" : "bg-blue/15 text-blue";
                return <div key={ticket.entryId || ticket.id} title={ticket.reviewFlag} className={`rounded-lg border px-3 py-2 text-sm ${tint} ${ticket.noBandwidth && !ticket.referenceOnly ? "opacity-60" : ""}`}>
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2">
                    <a href={ticket.url} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] font-bold text-blue hover:underline" title={`Ticket ${ticket.id}${(ticket.occurrence ?? 1) > 1 ? ` · Revision ${(ticket.occurrence ?? 1) - 1}` : ""}`}>#{ticket.id}{(ticket.occurrence ?? 1) > 1 ? ` · R${(ticket.occurrence ?? 1) - 1}` : ""}</a>
                    <p className={`truncate font-semibold ${client ? "text-ink" : "text-fuchsia-300"}`} title={ticket.client}><QueueLink href={clientTicketsUrl(client?.companyId || client?.id || ticket.clientId || "")}>{ticket.client || "Unknown client"}</QueueLink></p>
                    <span className="font-mono text-lime" title={ticket.noBandwidth ? "Excluded from workload totals" : undefined}>{signedTime(designTimeMinutes(ticket.designTime))}</span>
                  </div>
                  {ticket.referenceOnly && <p className="mt-1 text-[10px] text-red-300">Reference only - excluded from workload{ticket.currentAssignee && ticket.currentAssignee !== ticket.assignee ? ` - Now: ${ticket.currentAssignee}` : ` - ${ticket.status}`}</p>}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ticket.referenceOnly ? <button disabled={working || refreshing} onClick={() => removeCreativeEntry(ticket, "restore")} className="rounded-md border border-blue/40 px-2 py-0.5 text-[10px] font-bold text-blue disabled:opacity-40">Add again</button> : <button disabled={working || refreshing || !editable || canceled} onClick={() => updateTicketControl(ticket, "delivery")} className="rounded-md border border-lime/30 px-2 py-0.5 text-[10px] font-bold text-lime disabled:opacity-40">{status === "Delivered" ? "Undo Delivered" : "Mark Delivered"}</button>}
                      <button disabled={working || refreshing} onClick={() => removeCreativeEntry(ticket)} className="rounded-md border border-red-400/30 px-2 py-0.5 text-[10px] font-bold text-red-300 disabled:opacity-40">Delete</button>
                      {!ticket.referenceOnly && <DesignTimeEditor ticket={ticket} day={day} disabled={working || refreshing || !editable} onBusy={setWorking} onSaved={setData} />}
                      {!ticket.referenceOnly && <button aria-pressed={Boolean(ticket.noBandwidth)} disabled={working || refreshing || !editable} onClick={() => updateTicketControl(ticket, "bandwidth")} className={`rounded-md border border-red-400/40 px-2 py-0.5 text-[10px] font-bold text-red-300 disabled:opacity-40 ${ticket.noBandwidth ? "bg-red-400/20" : ""}`}>{ticket.noBandwidth ? "Restore BW" : "No BW"}</button>}
                    </div>
                    <span title={`Fetched status: ${ticket.status}`} className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${canceled ? "bg-red-400/15 text-red-300" : tag}`}>{canceled ? "Canceled" : status}</span>
                  </div>
                </div>;
              })}{!tickets.length && <p className="text-sm text-muted">No work saved for this day.</p>}</div>
          </details></div>;
        })}</div>
      </section>
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-lg font-semibold">Tickets waiting for assignment</h2>
        {waitingRows.length > 0 ? <div className="mt-3 overflow-x-auto"><div className="min-w-[420px]">
          <div>{waitingRows.map(({ client, tickets }) => <details key={client.id} className="overflow-hidden border-t border-line">
            <summary className="grid cursor-pointer list-none grid-cols-[35%_6rem_minmax(0,1fr)] items-center py-1.5 text-xs sm:text-sm">
              <QueueLink href={clientTicketsUrl(client.companyId || client.id)} className="truncate px-3 text-muted">{client.name}</QueueLink>
              <span className="px-3 text-muted tabular-nums">{new Set(tickets.map((ticket) => ticket.id)).size} tickets</span>
              <span className="px-3 text-right font-mono text-xs text-muted">{signedTime(client.dailyMinutes)}</span>
            </summary>
            <div className="space-y-1 px-3 pb-1.5 pt-1">{tickets.map((ticket) => <a className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm text-blue hover:underline" href={ticket.url} key={ticket.entryId || ticket.id} target="_blank" rel="noopener noreferrer"><span className="font-mono text-xs">#{ticket.id}</span><span className="truncate" title={ticket.title}>{ticket.title}</span></a>)}</div>
          </details>)}</div>
        </div></div> : <p className="mt-3 text-sm text-muted">No tickets waiting for assignment.</p>}
      </section>
      <section className="rounded-xl border border-blue/30 bg-panel p-5">
        <h2 className="text-lg font-semibold">Customer clarification <span className="text-sm text-muted">({clarifications.length})</span></h2>
        {clarifications.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] table-fixed text-left text-xs sm:text-sm">
          <colgroup><col className="w-[35%]" /><col className="w-24" /><col /></colgroup>
          <tbody>{clarifications.map((ticket) => <tr key={ticket.entryId || ticket.id} className="border-t border-line">
            <td className="truncate px-3 py-1.5 text-muted" title={ticket.client}><QueueLink href={ticket.clientId ? clientTicketsUrl(ticket.clientId) : undefined}>{ticket.client}</QueueLink></td>
            <td className="px-3 py-1.5 font-mono text-xs text-blue"><a href={ticket.url} target="_blank" rel="noopener noreferrer" className="hover:underline">#{ticket.id}</a></td>
            <td className="truncate px-3 py-1.5 text-blue" title={ticket.title}><a href={ticket.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{ticket.title}</a></td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-3 text-sm text-muted">No tickets awaiting customer clarification.</p>}
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <h2 className="p-5 text-lg font-semibold">Tickets Outside My Team</h2>
        {outsideTickets.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-inset text-muted"><tr>{["Ticket Number", "Client name", "Creative assigned", "DT assigned", "Ticket Status"].map((label) => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{outsideTickets.map((ticket) => {
            const status = simplifiedStatus(ticket);
            const statusColor = status === "Delivered" ? "text-lime" : status === "In Progress" ? "text-fuchsia-300" : "text-blue";
            return <tr key={ticket.entryId || ticket.id} className={`border-t border-line ${status === "Delivered" ? "bg-lime/10" : status === "In Progress" ? "bg-fuchsia-400/10" : ""}`}>
              <td className="px-5 py-3"><a href={ticket.url} target="_blank" rel="noopener noreferrer" title={ticket.title} className="font-mono text-xs text-blue hover:underline">#{ticket.id}</a>{(ticket.occurrence ?? 1) > 1 && <span className="ml-2 text-xs text-muted">Revision {(ticket.occurrence ?? 1) - 1}</span>}</td>
              <td className="px-5 py-3"><QueueLink href={ticket.clientId ? clientTicketsUrl(ticket.clientId) : undefined}>{ticket.client}</QueueLink></td>
              <td className="px-5 py-3 text-muted">{ticket.assignee}</td>
              <td className="px-5 py-3 font-mono text-xs">{signedTime(countedMinutes(ticket))}</td>
              <td className={`px-5 py-3 ${statusColor}`}><div className="flex items-center gap-2"><select aria-label={`Status for outside-team ticket ${ticket.id}, entry ${ticket.occurrence}`} title={`Fetched status: ${ticket.status}${ticket.outsideStatus ? " · Manual override saved" : ""}`} value={status} disabled={working || refreshing} onChange={(event) => updateOutsideStatus(ticket, event.target.value as OutsideStatus)} className={`rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold ${statusColor}`}>{outsideStatuses.map((status) => <option key={status}>{status}</option>)}</select>{ticket.outsideStatus && <button type="button" title="Use fetched status again" disabled={working || refreshing} onClick={() => updateOutsideStatus(ticket, null)} className="text-[10px] font-bold text-muted hover:text-ink">Reset</button>}</div></td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="px-5 pb-5 text-sm text-muted">No tickets assigned outside your team.</p>}
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-panel"><h2 className="p-5 text-lg font-semibold">Daily client allocation</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-inset text-muted"><tr>{["Client", "Last active", "Daily status", "Subscription", "Assigned DT", "Completed DT", "Daily DT", "Available DT"].map((title) => <th key={title} className="px-5 py-3">{title}</th>)}</tr></thead><tbody>{clientRows.map(({ client, tickets, allocated, complete, lastActiveDay }) => {
        const empty = tickets.length === 0;
        const maximized = !empty && client.dailyMinutes > 0 && allocated >= client.dailyMinutes;
        const fulfilled = !empty && client.dailyMinutes > 0 && complete >= client.dailyMinutes;
        const unassigned = !empty && allocated === 0;
        const rowColor = empty ? "text-[#505050] [&>td]:text-[#505050]" : fulfilled ? "bg-lime/10" : maximized ? "bg-blue/10" : unassigned ? "bg-yellow-400/10" : "";
        const statusColor = empty ? "text-muted" : fulfilled ? "text-lime" : maximized ? "text-blue" : unassigned ? "text-yellow-300" : "text-muted";
        const label = empty ? "No tickets today" : fulfilled ? "Daily DT completed" : maximized ? "Utilization maximized" : unassigned ? "No assigned DT" : "Partially assigned";
        return <tr key={client.id} className={`border-t border-line ${rowColor}`}>
          <td className="px-5 py-3"><QueueLink href={clientTicketsUrl(client.companyId || client.id)}>{client.name}</QueueLink></td>
          <td className="whitespace-nowrap px-5 py-3 text-xs text-muted" title={lastActiveDay ? `Last recorded work: ${lastActiveDay}` : "No recorded work in saved history"}>{lastActiveLabel(lastActiveDay, day)}</td>
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
