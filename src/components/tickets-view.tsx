"use client";
import { teamFetch } from "@/lib/team-fetch";

import { useState, useEffect } from "react";
import { useTeam } from "@/components/team-switcher";
import { normalizeName } from "@/lib/daily";
import type { Registry } from "@/types/operations";
import type { TicketResult } from "@/types/ticket";
import { groupTicketsByClient, formatDesignTime } from "@/lib/design-time";
import { countedMinutes } from "@/lib/ticket-status";
import type { Ticket } from "@/types/ticket";
import { PageHeading } from "@/components/page-heading";
import { QueueLink } from "@/components/queue-link";
import { clientTicketsUrl, creativeTicketsUrl } from "@/lib/queue-links";

const totalDesignTime = (tickets: Ticket[]) => formatDesignTime(tickets.reduce((sum, ticket) => sum + countedMinutes(ticket), 0));

export function TicketsView({ source = "clients" }: { source?: "clients" | "creatives" }) {
  const team = useTeam();
  const isCrew = source === "creatives";
  const [teamId] = useState(team.queueId || "");
  const [fetchedTeamId, setFetchedTeamId] = useState("");
  const [result, setResult] = useState<TicketResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [client, setClient] = useState("");
  const [creative, setCreative] = useState("");
  const [status, setStatus] = useState("");
  const [showPc, setShowPc] = useState(true);
  const [showNoPc, setShowNoPc] = useState(true);
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<Registry>({ clients: [], creatives: [] });
  const creativeAlias = (name: string) => records.creatives.find((creative) => normalizeName(creative.name) === normalizeName(name))?.alias ?? name;
  const otherTeam = (name: string) => Boolean(name) && !/^(not assigned|unassigned)$/i.test(name) && !records.creatives.some((creative) => normalizeName(creative.name) === normalizeName(name));
  const clients = records.clients;
  const clientRecord = (ticket: Ticket) => clients.find((client) => ticket.clientId ? client.id === ticket.clientId || client.companyId === ticket.clientId : normalizeName(client.name) === normalizeName(ticket.client));
  const groupQueue = (name: string, tickets: Ticket[]) => {
    if (isCrew) return creativeTicketsUrl(records.creatives.find((creative) => normalizeName(creative.name) === normalizeName(tickets[0]?.assignee || ""))?.designerId);
    const client = clients.find((client) => normalizeName(client.name) === normalizeName(name) || client.id === tickets[0]?.clientId || client.companyId === tickets[0]?.clientId);
    const companyId = client?.companyId || client?.id || tickets[0]?.clientId;
    return companyId ? clientTicketsUrl(companyId) : undefined;
  };
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ source });
    if (isCrew) query.set("teamId", teamId);
    Promise.all([teamFetch("/api/registry", { signal: controller.signal }).then((response) => response.json()), teamFetch(`/api/tickets?${query}`, { signal: controller.signal }).then((response) => response.json())]).then(([registry, saved]) => {
      if (saved?.error) throw new Error(saved.error);
      setRecords(registry); setResult(saved); setFetchedTeamId(teamId); setError("");
    }).catch((error) => { if (error.name !== "AbortError") setError("Unable to load saved queues: " + error.message); });
    return () => controller.abort();
  }, [source, isCrew, teamId]);
  const tickets = result?.tickets ?? [];
  const visible = tickets.filter((ticket) => (isCrew || ((clientRecord(ticket)?.pc || "NO PC") === "NO PC" ? showNoPc : showPc)) && (!client || ticket.client === client) && (!creative || ticket.assignee === creative) && (!status || ticket.status === status) && `${ticket.id} ${ticket.title} ${ticket.client}`.toLowerCase().includes(search.toLowerCase()));
  const groups = isCrew
    ? [...visible.reduce((groups, ticket) => {
      const key = creativeAlias(ticket.assignee);
      groups.set(key, [...(groups.get(key) ?? []), ticket]);
      return groups;
    }, new Map<string, typeof visible>()).entries()].sort(([a], [b]) => a.localeCompare(b))
    : groupTicketsByClient(visible);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      if (isCrew && !/^\d+$/.test(teamId)) throw new Error("Team ID must contain digits only.");
      const query = new URLSearchParams({ source });
      if (isCrew) query.set("teamId", teamId);
      const response = await teamFetch(`/api/tickets?${query}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to fetch tickets.");
      setResult(data);
      if (isCrew) setFetchedTeamId(teamId);
      setClient(""); setCreative(""); setStatus("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to fetch tickets.");
    } finally { setLoading(false); }
  }

  const filter = (label: string, value: string, setter: (value: string) => void, options: string[]) => (
    <label className="text-xs font-medium text-muted">{label}
      <select value={value} onChange={(event) => setter(event.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-inset px-3 py-2.5 text-sm text-ink">
        <option value="">All {label === "Status" ? "statuses" : `${label.toLowerCase()}s`}</option>
        {options.map((option) => <option key={option} value={option}>{label === "Creative" ? creativeAlias(option) : option}</option>)}
      </select>
    </label>
  );

  return <div>
    <div className="dashboard-controls flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div><PageHeading title={isCrew ? "Creative tickets" : "Client tickets"} updated={result ? `Updated ${new Date(result.fetchedAt).toLocaleTimeString()}` : "No saved activity"} /><p className="mt-3 text-sm text-muted">{isCrew ? "Your team queue, grouped by creative." : `Active queues across ${clients.length} configured clients.`}</p></div>
      <button disabled={loading} onClick={refresh} className="rounded-xl bg-lime px-5 py-3 text-sm font-semibold text-inset hover:bg-lime/85 disabled:cursor-wait disabled:opacity-60">{loading ? "Fetching queues…" : result ? "Refresh tickets ↻" : "Fetch tickets ↗"}</button>
    </div>
    {isCrew && <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel p-5"><label className="text-sm text-muted">{team.name} · Team ID<input inputMode="numeric" value={teamId} readOnly disabled={loading} className="ml-3 w-24 rounded-lg border border-line bg-inset px-3 py-2 text-ink" /></label><p className="text-xs text-muted">Queues belong to the selected workspace.{result && ` Current results: team ${fetchedTeamId}.`}</p></div>}
    <div aria-live="polite" className="mt-5 space-y-2">
      {loading && <p className="text-sm text-muted">Reading all queue pages. Larger queues may take a few minutes.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}{result && " The table still shows the previous successful fetch."}</p>}
      {result?.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">{warning}</p>)}
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[[tickets.length, "Tickets found"], [new Set(tickets.map((ticket) => ticket.client)).size, "Clients in queue"], [tickets.filter((ticket) => ticket.assignee === "Not assigned").length, "Awaiting assignment"], [totalDesignTime(tickets), "Total DT · all fetched tickets"]].map(([value, label]) => <div key={label} className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold text-lime">{result ? value : "—"}</p><p className="mt-2 text-xs text-muted">{label}</p></div>)}
    </div>
    <section aria-label="Client ticket results" className="mt-6 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium text-muted">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ticket ID, title or client" className="mt-2 block w-full rounded-lg border border-line bg-inset px-3 py-2.5 text-sm text-ink" /></label>
        {filter("Client", client, setClient, [...new Set(tickets.map((ticket) => ticket.client))].sort())}
        {isCrew && filter("Creative", creative, setCreative, [...new Set(tickets.map((ticket) => ticket.assignee))].sort())}
        {isCrew ? filter("Status", status, setStatus, [...new Set(tickets.map((ticket) => ticket.status))].sort()) : <fieldset className="sm:col-span-2"><legend className="text-xs font-medium text-muted">Production Coordinator</legend><div className="mt-2 flex gap-2"><button type="button" aria-pressed={showPc} onClick={() => setShowPc(!showPc)} className={`rounded-lg border px-3 py-2.5 text-sm ${showPc ? "border-blue/50 bg-blue/15 text-blue" : "border-line text-muted"}`}>Yes</button><button type="button" aria-pressed={showNoPc} onClick={() => setShowNoPc(!showNoPc)} className={`rounded-lg border px-3 py-2.5 text-sm ${showNoPc ? "border-blue/50 bg-blue/15 text-blue" : "border-line text-muted"}`}>No</button></div></fieldset>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-inset text-xs text-muted"><tr>{["Ticket", "Title", "Creative", "Status", "Position", "Design time", "Time spent"].map((heading) => <th key={heading} scope="col" className="px-5 py-4 font-medium">{heading}</th>)}</tr></thead>
          {groups.map(([clientName, clientTickets], index) => <tbody key={clientName}>
            {index > 0 && <tr aria-hidden="true" className="bg-canvas"><td colSpan={7} className="h-6 border-y border-line p-0" /></tr>}
            <tr className="border-t border-line bg-lime/5"><th scope="rowgroup" colSpan={7} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-semibold text-lime"><QueueLink href={groupQueue(clientName, clientTickets)}>{clientName}</QueueLink><span className="ml-3 text-xs font-normal text-muted">{clientTickets.length} {clientTickets.length === 1 ? "ticket" : "tickets"}</span></span><span className="text-xs font-medium text-ink">{!isCrew && clientRecord(clientTickets[0]) && <span className="mr-4 text-muted">{clientRecord(clientTickets[0])!.pc} - Daily DT {formatDesignTime(clientRecord(clientTickets[0])!.dailyMinutes)}</span>}DT subtotal <span className="ml-2 font-mono text-lime">{totalDesignTime(clientTickets)}</span></span></div></th></tr>
            {clientTickets.map((ticket) => <tr key={ticket.entryId || ticket.id} className="border-t border-line hover:bg-inset/70">
              <td className="px-5 py-5"><a href={ticket.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-medium text-blue hover:underline">#{ticket.id} ↗</a>{(ticket.occurrence ?? 1) > 1 && <span className="mt-1 block text-xs text-lime">Revision {(ticket.occurrence ?? 1) - 1}</span>}</td>
              <td className="max-w-sm px-5 py-5 font-medium text-ink">{ticket.title}{isCrew && <p className="mt-1 text-xs font-normal text-muted"><QueueLink href={ticket.clientId ? clientTicketsUrl(ticket.clientId) : undefined}>{ticket.client}</QueueLink></p>}{ticket.retained && <span className="mt-2 block text-xs font-normal text-amber-200">Retained daily work · no longer in this queue</span>}</td>
              <td className="px-5 py-5 text-muted"><QueueLink href={creativeTicketsUrl(records.creatives.find((creative) => normalizeName(creative.name) === normalizeName(ticket.assignee))?.designerId)}>{creativeAlias(ticket.assignee)}</QueueLink>{otherTeam(ticket.assignee) && <span className="mt-1 block w-fit rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">Other team</span>}</td>
              <td className="px-5 py-5"><span className="inline-block rounded-full border border-blue/30 bg-blue/10 px-3 py-1 text-xs text-ink">{ticket.status}</span>{ticket.reviewFlag && <p className="mt-1 text-xs text-amber-200">{ticket.reviewFlag}</p>}</td>
              <td className="px-5 py-5 text-muted">{ticket.position ?? "—"}</td>
              <td className="px-5 py-5 font-mono text-xs text-lime">{formatDesignTime(countedMinutes(ticket))}</td>
              <td className="px-5 py-5 text-muted">{ticket.timeSpentMinutes === null ? "Not tracked" : `${ticket.timeSpentMinutes} min`}</td>
            </tr>)}
          </tbody>)}
        </table>
      </div>
      {!visible.length && <div className="px-6 py-16 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-lime/10 text-xl text-lime" aria-hidden>▤</div><h2 className="font-medium">{result ? tickets.length ? "No matching tickets" : "Your active queues are empty" : "Your queue starts here"}</h2><p className="mt-2 text-sm text-muted">{result ? tickets.length ? "Adjust your filters to see more results." : "No active tickets were returned by the configured sources." : "Fetch tickets to read your current client queues."}</p></div>}
      <div className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-4 text-xs text-muted"><span>{result ? `${visible.length} of ${tickets.length} tickets · Visible DT ${totalDesignTime(visible)} · ${result.pagesFetched} pages read` : "No tickets saved for today"}</span><span>{result ? `Saved ${new Date(result.fetchedAt).toLocaleString()}` : "Fetch today's queues to begin · Previous days are retained"}</span></div>
    </section>
    <p className="mt-4 text-xs leading-6 text-muted">All statuses returned by the active queues are included. Not Set DT counts as 0:00. Client subtotals reflect visible tickets; the total above includes all fetched tickets. DT is the platform estimate, not measured time spent.</p>
  </div>;
}
