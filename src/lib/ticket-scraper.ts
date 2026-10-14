import "server-only";
import { clientQueueUrl } from "@/data/clients";
import { creativeQueueUrl, defaultTeam } from "@/data/team";
import { parseTicketPage, parseTicketStatus, parseTicketDetail } from "@/lib/ticket-parser";
import type { Ticket, TicketResult } from "@/types/ticket";

const origin = "https://jar.designpickle.com";

export async function fetchTicketDetail(ticketId: string) {
  if (!/^\d+$/.test(ticketId)) throw new Error("Invalid ticket ID.");
  const cookie = process.env.DP_COOKIE?.trim();
  if (!cookie) throw new Error("Set DP_COOKIE in .env.local and restart the server.");
  let response: Response;
  try {
    response = await fetch(`${origin}/admin/tickets/${ticketId}`, { headers: { Cookie: cookie, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
  } catch { throw new Error("Unable to reach the ticket website. Try again."); }
  if (!response.ok) throw new Error(`Ticket lookup returned HTTP ${response.status}. Check your cookie and ticket access.`);
  return parseTicketDetail(await response.text());
}

export async function fetchTicketStatus(ticketId: string) {
  if (!/^\d+$/.test(ticketId)) throw new Error("Invalid ticket ID.");
  const cookie = process.env.DP_COOKIE?.trim();
  if (!cookie) throw new Error("DP_COOKIE is missing.");
  const response = await fetch(`${origin}/admin/tickets/${ticketId}`, { headers: { Cookie: cookie, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Ticket detail returned HTTP ${response.status}.`);
  return parseTicketStatus(await response.text());
}

function validateQueue(value: string) {
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== "/admin/tickets" || url.username || url.password) throw new Error("Queue URL must point to https://jar.designpickle.com/admin/tickets.");
  return url;
}

export async function scrapeTickets(options?: { source: "clients" | "creatives"; teamId?: string; clientUrl?: string }): Promise<TicketResult> {
  const cookie = process.env.DP_COOKIE?.trim();
  if (!cookie) throw new Error("Set DP_COOKIE in .env.local and restart the server.");
  const queues: { source: "clients" | "creatives"; url: URL }[] = [];
  const warnings: string[] = [];
  if (options?.source === "creatives") {
    const teamId = options.teamId || process.env.DP_TEAM_ID || defaultTeam.id;
    const queue = validateQueue(process.env.DP_CREATIVE_QUEUE_URL || creativeQueueUrl(teamId));
    queue.searchParams.delete("q[designer_qr_team_id_in][]");
    queue.searchParams.append("q[designer_qr_team_id_in][]", teamId);
    if (!/^\d+$/.test(teamId)) throw new Error("Team ID must contain digits only.");
    queues.push({ source: "creatives", url: queue });
  } else {
    queues.push({ source: "clients", url: validateQueue(options?.clientUrl || process.env.DP_CLIENT_QUEUE_URL || clientQueueUrl()) });
    // Preserve the legacy combined fetch for direct callers; the UI explicitly selects a source.
    if (!options && process.env.DP_CREATIVE_QUEUE_URL) queues.push({ source: "creatives", url: validateQueue(process.env.DP_CREATIVE_QUEUE_URL) });
  }
  const tickets = new Map<string, Ticket>();
  let pagesFetched = 0;
  for (const queue of queues) {
    const seen = new Set<string>();
    let url = queue.url;
    for (let page = 1; ; page++) {
      if (page > 100) throw new Error("Queue exceeded 100 pages. Fetch stopped to avoid an incomplete result.");
      let response: Response;
      try {
        response = await fetch(url, { headers: { Cookie: cookie, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000) });
      } catch { throw new Error("Unable to reach the ticket website. Check your connection and try again."); }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const path = location ? new URL(location, url).pathname : "";
        if (/sign_in|login|sign-in/i.test(path)) throw new Error("The ticket website redirected to sign-in (HTTP " + response.status + "). The configured cookie was not accepted. Copy the current Cookie header used by Apps Script into DP_COOKIE in .env.local, then restart the server.");
        throw new Error(`The ticket website returned an unexpected redirect (HTTP ${response.status}). Check the configured queue URL.`);
      }
      if (response.status === 401) throw new Error("The ticket website returned HTTP 401. Check DP_COOKIE and restart the server after updating it.");
      if (response.status === 403) throw new Error("The ticket website returned HTTP 403. This can indicate account permissions or a request/network restriction; it does not necessarily mean the cookie expired.");
      if (!response.ok) throw new Error(`Ticket website returned HTTP ${response.status}. Try again later.`);
      const parsed = parseTicketPage(await response.text(), queue.source);
      pagesFetched++;
      if (!parsed.tickets.length && parsed.rowCount > 1) throw new Error("Rows were found but no ticket IDs could be read. Check the website layout.");
      // Out-of-range pages can be empty while still advertising a bogus next page.
      if (!parsed.tickets.length) break;
      const signature = parsed.tickets.map((ticket) => ticket.id).join(",");
      if (signature && seen.has(signature)) throw new Error("The website repeated a page. Fetch stopped to avoid reporting an incomplete queue.");
      seen.add(signature);
      for (const ticket of parsed.tickets) {
        const existing = tickets.get(ticket.id);
        if (existing) existing.sources = Array.from(new Set([...existing.sources, ...ticket.sources]));
        else tickets.set(ticket.id, ticket);
      }
      if (parsed.nextLink) {
        const next = validateQueue(new URL(parsed.nextLink, url).toString());
        // Preserve configured queue filters when the pagination link contains only a page number.
        const nextPage = next.searchParams.get("page");
        if (!nextPage || !/^\d+$/.test(nextPage) || Number(nextPage) <= Number(url.searchParams.get("page") || "1")) throw new Error("Unrecognized or non-advancing pagination link. Queue fetch stopped.");
        url = new URL(queue.url);
        url.searchParams.set("page", nextPage);
      } else if (!parsed.hasPagination && parsed.rowCount >= 25) {
        url = new URL(queue.url);
        url.searchParams.set("page", String(page + 1));
      } else break;
    }
  }
  return { tickets: [...tickets.values()], fetchedAt: new Date().toISOString(), pagesFetched, warnings };
}
