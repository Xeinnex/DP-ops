import type { Ticket } from "@/types/ticket";
import { normalizeName } from "@/lib/daily";

export function creativeWork(tickets: Ticket[], worked: Ticket[], name: string) {
  const identity = (ticket: Ticket) => ticket.entryId || `${ticket.id}:1`;
  const current = tickets.filter((ticket) => normalizeName(ticket.assignee) === normalizeName(name));
  const locked = worked.filter((ticket) => normalizeName(ticket.assignee) === normalizeName(name));
  return [
    ...current.map((ticket) => ({ ...ticket, worked: locked.some((record) => identity(record) === identity(ticket)) })),
    ...locked.filter((record) => !current.some((ticket) => identity(ticket) === identity(record))).map((record) => ({ ...record, worked: true, retained: true })),
  ];
}
