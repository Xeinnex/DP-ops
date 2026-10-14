import type { Ticket } from "@/types/ticket";
import type { CreativeRecord } from "@/types/operations";
import { normalizeName } from "@/lib/daily";
import { statusKey } from "@/lib/ticket-status";

export const outsideStatuses = ["Assigned", "In Progress", "Delivered"] as const;
export type OutsideStatus = typeof outsideStatuses[number];

export function outsideTeam(ticket: Ticket, creatives: CreativeRecord[]) {
  const name = normalizeName(ticket.assignee || "");
  return Boolean(name) && !["not assigned", "unassigned", "none"].includes(name) && !creatives.some((creative) => normalizeName(creative.name) === name);
}

export function simplifiedStatus(ticket: Ticket): OutsideStatus {
  if (typeof ticket.deliveryOverride === "boolean") return ticket.deliveryOverride ? "Delivered" : "Assigned";
  if (ticket.outsideStatus) return ticket.outsideStatus;
  if ((ticket.completion ?? 0) >= 1 || ["customer_review", "closed", "archived"].includes(statusKey(ticket.status))) return "Delivered";
  if ((ticket.completion ?? 0) > 0 || ["in_progress", "quality_review"].includes(statusKey(ticket.status))) return "In Progress";
  return "Assigned";
}
