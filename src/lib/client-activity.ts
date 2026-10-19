interface AllocationRow { client: { name: string }; tickets: unknown[]; lastActiveDay?: string }

export function compareClientAllocation(a: AllocationRow, b: AllocationRow) {
  const group = Number(b.tickets.length > 0) - Number(a.tickets.length > 0);
  if (group) return group;
  if (!a.tickets.length && !b.tickets.length) {
    const recentFirst = (b.lastActiveDay || "").localeCompare(a.lastActiveDay || "");
    if (recentFirst) return recentFirst;
  }
  return a.client.name.localeCompare(b.client.name);
}

export function lastActiveLabel(lastActiveDay: string | undefined, day: string) {
  if (!lastActiveDay) return "No history";
  const days = Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${lastActiveDay}T00:00:00Z`)) / 86400000));
  if (days > 60) return "60+ days";
  return days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} ago`;
}
