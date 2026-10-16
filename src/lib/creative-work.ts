import type { Ticket } from "@/types/ticket";
import { normalizeName } from "@/lib/daily";

export function creativeWork(tickets: Ticket[], worked: Ticket[], name: string) {
  const identity = (ticket: Ticket) => ticket.entryId || `${ticket.id}:1`;
  const current = tickets.filter((ticket) => !ticket.hiddenFromCreative && normalizeName(ticket.assignee) === normalizeName(name)).map((ticket) => ({ ...ticket, referenceOnly: ticket.referenceOnly || /^(Customer Clarification|Draft|Inactive|Cancel[l]?ed)$/i.test(ticket.status) || Boolean(ticket.retained && (ticket.completion ?? 0) < 1) }));
  const locked = worked.filter((ticket) => !ticket.hiddenFromCreative && normalizeName(ticket.assignee) === normalizeName(name));
  return [
    ...current.map((ticket) => ({ ...ticket, worked: locked.some((record) => identity(record) === identity(ticket)) })),
    ...locked.filter((record) => !current.some((ticket) => identity(ticket) === identity(record))).map((record) => ({ ...record, worked: true, retained: true })),
  ];
}
