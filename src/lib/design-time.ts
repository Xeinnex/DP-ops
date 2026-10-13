import type { Ticket } from "@/types/ticket";

export function designTimeMinutes(value: string | null): number {
  const match = value?.trim().match(/^(\d+):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function formatDesignTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function totalDesignTime(tickets: Ticket[]): string {
  return formatDesignTime(tickets.reduce((sum, ticket) => sum + designTimeMinutes(ticket.designTime), 0));
}

export function groupTicketsByClient(tickets: Ticket[]) {
  const groups = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    const client = ticket.client || "Unknown client";
    const group = groups.get(client) ?? [];
    group.push(ticket);
    groups.set(client, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
