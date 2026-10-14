import type { Ticket } from "@/types/ticket";
import type { CreativeRecord } from "@/types/operations";
import { designTimeMinutes } from "@/lib/design-time";

export function statusKey(value: string) {
  const text = value.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (text.startsWith("in progress")) return "in_progress";
  if (text.includes("revision") && text.startsWith("open")) return "revision";
  if (text.startsWith("incomplete")) return "incomplete";
  if (text === "cancelled" || text === "canceled") return "canceled";
  return text.replace(/ /g, "_");
}

export interface WorkEntry extends Ticket {
  entryId: string;
  occurrence: number;
  completion: number;
  seenInProgress: boolean;
  revisionEligible: boolean;
  lockedWip: boolean;
  excluded: boolean;
  reviewFlag?: string;
  previousStatus?: string;
}

export function applyObservation(entries: WorkEntry[], ticket: Ticket): WorkEntry[] {
  const next = statusKey(ticket.status);
  const previous = entries.at(-1);
  if (!previous && ["draft", "inactive"].includes(next)) return entries;
  // Completed WIP is frozen until the next calendar day. Cancellation always stops DT counting.
  if (previous?.lockedWip && next !== "canceled") return entries;
  const revision = next === "revision" && previous && statusKey(previous.status) !== "revision" && previous.revisionEligible;
  const base = revision ? undefined : previous;
  const occurrence = revision ? previous.occurrence + 1 : previous?.occurrence ?? 1;
  const seenInProgress = Boolean(base?.seenInProgress) || next === "in_progress";
  let completion = 0;
  let reviewFlag: string | undefined;
  if (next === "in_progress") completion = 0.5;
  else if (next === "quality_review") completion = 0.8;
  else if (["customer_review", "closed", "archived"].includes(next)) completion = 1;
  else if (next === "incomplete") completion = seenInProgress ? 1 : 0;
  else if (seenInProgress && !["canceled", "draft", "inactive", "customer_clarification"].includes(next)) completion = 1;
  if (base?.seenInProgress && next !== "in_progress" && next !== statusKey(base.status)) reviewFlag = "Status changed after In Progress — verify delivery";
  if (next === "canceled") reviewFlag = "Canceled — excluded from DT";
  const entry: WorkEntry = {
    ...ticket,
    designTime: base?.dtLocked && (next !== "in_progress" || base.dtFrozen) ? base.designTime : (next === "in_progress" || completion === 1) && ticket.designTime === null && base ? base.designTime : ticket.designTime,
    dtLocked: Boolean(base?.dtLocked) || next === "in_progress" || completion === 1,
    dtFrozen: Boolean(base?.dtFrozen) || Boolean(base?.dtLocked && next !== "in_progress") || completion === 1,
    entryId: `${ticket.id}:${occurrence}`,
    occurrence,
    completion,
    manualCompletion: false,
    seenInProgress,
    previousStatus: base?.status !== ticket.status ? base?.status : base?.previousStatus,
    revisionEligible: Boolean(base?.revisionEligible) || ["assigned", "in_progress", "quality_review", "customer_review", "incomplete", "closed", "archived"].includes(next),
    lockedWip: next === "incomplete" && seenInProgress,
    excluded: ["draft", "inactive"].includes(next),
    reviewFlag: reviewFlag || (base?.status === ticket.status ? base.reviewFlag : undefined),
  };
  if (revision) {
    // A separate work cycle: keep the earlier payload and owner, and infer completion only after observed progress.
    const earlier = previous.seenInProgress || statusKey(previous.status) === "quality_review" ? { ...previous, completion: 1, reviewFlag: "Revision after work — verify earlier delivery" } : previous;
    return [...entries.slice(0, -1), earlier, entry];
  }
  return [...entries.slice(0, -1), entry];
}

export function countedMinutes(ticket: Ticket) {
  if (ticket.noBandwidth) return 0;
  return ["canceled", "customer_clarification", "draft", "inactive"].includes(statusKey(ticket.status)) ? 0 : designTimeMinutes(ticket.designTime);
}

export function completedMinutes(ticket: Ticket) {
  return countedMinutes(ticket) * (ticket.completion ?? 0);
}

export function scopeRank(creative: CreativeRecord) {
  const scopes = new Set(creative.scopes);
  if (scopes.has("VE")) return 5;
  if (scopes.has("MG")) return 4;
  if (scopes.has("CI")) return 3;
  if (scopes.has("FIG")) return 2;
  if (scopes.has("PD")) return 1;
  return scopes.has("GD") ? 0 : 6;
}
