import type { ClientRecord } from "@/types/operations";
import type { Ticket } from "@/types/ticket";
import { normalizeName } from "@/lib/daily";
import { statusKey } from "@/lib/ticket-status";

const excluded = new Set(["customer_clarification", "canceled", "draft", "inactive"]);
const assigned = (ticket: Ticket) => Boolean(ticket.assignee.trim()) && !/^(not assigned|unassigned|none)$/i.test(ticket.assignee.trim());

export function waitingAssignments(clients: ClientRecord[], tickets: Ticket[]) {
  return clients.flatMap((client) => {
    const queue = tickets.filter((ticket) => ticket.clientId
      ? ticket.clientId === client.id || ticket.clientId === client.companyId
      : normalizeName(ticket.client) === normalizeName(client.name));
    // Assignment is based on ownership, even when assigned DT is zero.
    const hasAssignments = queue.some((ticket) => assigned(ticket) && !excluded.has(statusKey(ticket.status)));
    const hasPc = client.pc === "PC" || client.pc === "PC AD";
    if (!hasPc && hasAssignments) return [];
    const waiting = queue.filter((ticket) => !assigned(ticket) && !ticket.retained && !ticket.independentManual
      && !excluded.has(statusKey(ticket.status)) && !["customer_review", "closed", "archived"].includes(statusKey(ticket.status))
      && (ticket.completion ?? 0) < 1)
      .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
    const unique = [...new Map(waiting.map((ticket) => [ticket.id, ticket])).values()];
    const selected = hasPc ? unique : unique.slice(0, 1);
    return selected.length ? [{ client, tickets: selected }] : [];
  }).sort((a, b) => a.client.name.localeCompare(b.client.name));
}
