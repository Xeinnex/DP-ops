import type { CreativeRecord } from "@/types/operations";

export const availabilityOptions = [
  { value: "available", label: "Available", className: "bg-lime text-inset" },
  { value: "half_day", label: "Half Day", className: "bg-yellow-400 text-inset" },
  { value: "away", label: "Away", className: "bg-red-500 text-white" },
] as const;

export function effectiveCapacity(creative: CreativeRecord) {
  return creative.availability === "away" ? 0 : creative.availability === "half_day" ? 225 : creative.capacityMinutes;
}

export function capacityPercent(minutes: number, capacity: number) {
  return capacity > 0 ? Math.round(minutes / capacity * 100) : minutes > 0 ? 100 : 0;
}

export function bandwidthBar(assigned: number, completed: number, capacity: number) {
  const limit = Math.max(capacity, assigned, 0);
  return {
    limit,
    assignedPercent: Math.min(capacityPercent(assigned, limit), 100),
    completedPercent: Math.min(capacityPercent(completed, limit), 100),
  };
}
