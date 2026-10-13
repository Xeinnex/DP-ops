import "server-only";
import { scrapeTickets, fetchTicketStatus } from "@/lib/ticket-scraper";
import { registry, saveFetch, missingStatusCandidates, claimDetailCheck, saveDetailCheck, capturePreviousProgress } from "@/lib/database";

const globalLock = globalThis as typeof globalThis & { dpQueueBusy?: boolean };
export async function withQueueLock<T>(task: () => Promise<T>) {
  if (globalLock.dpQueueBusy) throw new Error("A queue fetch is already running. Please wait.");
  globalLock.dpQueueBusy = true;
  try { return await task(); } finally { globalLock.dpQueueBusy = false; }
}

export async function syncSource(source: "clients" | "creatives", teamId: string, day: string, capture = true) {
  if (capture) capturePreviousProgress(day);
  const clientUrl = new URL("https://jar.designpickle.com/admin/tickets");
  const configured = registry().clients;
  configured.forEach((client) => clientUrl.searchParams.append("q[company_id_in][]", client.companyId || client.id));
  clientUrl.searchParams.set("q[ticket_status]", "active");
  const result = source === "clients" && !configured.length ? { tickets: [], fetchedAt: new Date().toISOString(), pagesFetched: 0, warnings: [] }
    : await scrapeTickets({ source, teamId, clientUrl: source === "clients" ? clientUrl.toString() : undefined });
  saveFetch(result, source, source === "creatives" ? teamId : "clients", day);
  return result;
}

export async function syncDashboard(day: string) {
  capturePreviousProgress(day);
  const clients = await syncSource("clients", "347", day, false);
  const creatives = await syncSource("creatives", "347", day, false);
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
