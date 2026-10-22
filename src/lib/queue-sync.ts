import { teamQueueId, activeTeam } from "@/lib/team-context";
import "server-only";
import { scrapeTickets, fetchTicketStatus } from "@/lib/ticket-scraper";
import { registry, saveFetch, missingStatusCandidates, claimDetailCheck, saveDetailCheck, capturePreviousProgress } from "@/lib/database";

const globalLock = globalThis as typeof globalThis & { dpQueueBusy?: Set<string> };
export async function withQueueLock<T>(task: () => Promise<T>) {
  const locks = globalLock.dpQueueBusy ??= new Set();
  const key = activeTeam().code;
  if (locks.has(key)) throw new Error("A queue fetch is already running. Please wait.");
  locks.add(key);
  try { return await task(); } finally { locks.delete(key); }
}

export async function syncSource(source: "clients" | "creatives", teamId: string, day: string, capture = true) {
  if (capture) capturePreviousProgress(day);
  const clientUrl = new URL("https://jar.designpickle.com/admin/tickets");
  const configured = registry().clients;
  if (source === "clients" && configured.some((client) => !/^\d+$/.test(client.companyId || client.id))) throw new Error("Some clients still need company IDs. Configure them in Clients DB before fetching.");
  configured.forEach((client) => clientUrl.searchParams.append("q[company_id_in][]", client.companyId || client.id));
  clientUrl.searchParams.set("q[ticket_status]", "active");
  const result = source === "clients" && !configured.length ? { tickets: [], fetchedAt: new Date().toISOString(), pagesFetched: 0, warnings: [] }
    : await scrapeTickets({ source, teamId, clientUrl: source === "clients" ? clientUrl.toString() : undefined });
  saveFetch(result, source, source === "creatives" ? teamId : "clients", day);
  return result;
}

export async function syncDashboard(day: string) {
  capturePreviousProgress(day);
  const clients = await syncSource("clients", teamQueueId(), day, false);
  const creatives = await syncSource("creatives", teamQueueId(), day, false);
  const visible = new Set([...clients.tickets, ...creatives.tickets].map((ticket) => ticket.id));
  const warnings: string[] = [];
  let checked = 0;
  for (const ticket of missingStatusCandidates(day, visible)) {
    if (!claimDetailCheck(day, ticket.id)) continue;
    checked++;
    try { saveDetailCheck(day, ticket, await fetchTicketStatus(ticket.id)); }
    catch (error) { const message = `Status check failed for #${ticket.id}: ${error instanceof Error ? error.message : "Unknown error"} Previous status retained; no repeat until it reappears in a queue.`; saveDetailCheck(day, ticket, undefined, message); warnings.push(message); }
  }
  return { warnings, checked };
}
