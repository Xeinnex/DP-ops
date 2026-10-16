import type { DailyData, CreativeProgress } from "@/types/operations";
import { creativeWork } from "@/lib/creative-work";
import { countedMinutes, completedMinutes } from "@/lib/ticket-status";
import { effectiveCapacity } from "@/lib/availability";

export function creativeProgress(data: Pick<DailyData, "creatives" | "tickets" | "workedTickets">): CreativeProgress[] {
  return data.creatives.map((creative) => {
    const tickets = creativeWork(data.tickets, data.workedTickets, creative.name);
    return { creativeId: creative.id, assignedMinutes: tickets.reduce((total, ticket) => total + countedMinutes(ticket), 0), completedMinutes: Math.round(tickets.reduce((total, ticket) => total + completedMinutes(ticket), 0)), capacityMinutes: effectiveCapacity(creative) };
  });
}
