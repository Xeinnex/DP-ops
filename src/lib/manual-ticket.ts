export const manualStatuses = ["Open", "Open (Revision)", "Assigned", "In Progress", "Incomplete (WIP)", "Incomplete (Revision)", "Quality Review", "Customer Review", "Customer Clarification", "Closed", "Archived", "Canceled"];

export function ticketIdFromUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Paste a valid ticket URL."); }
  const match = url.pathname.match(/^\/admin\/tickets\/(\d+)\/?$/);
  if (url.origin !== "https://jar.designpickle.com" || url.username || url.password || !match) throw new Error("Use a https://jar.designpickle.com/admin/tickets/1234567 URL.");
  return match[1];
}
