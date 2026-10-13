export function clientTicketsUrl(companyId: string) {
  if (!/^\d+$/.test(companyId)) return undefined;
  const url = new URL("https://jar.designpickle.com/admin/tickets");
  url.searchParams.set("q[company_id_eq]", companyId);
  url.searchParams.set("q[ticket_status]", "active");
  return url.toString();
}

export function creativeTicketsUrl(designerId?: string | null) {
  if (!designerId || !/^\d+$/.test(designerId)) return undefined;
  const url = new URL("https://jar.designpickle.com/admin/tickets");
  ["1", "2", "3", "4", "5", "7"].forEach((state) => url.searchParams.append("q[state_in][]", state));
  url.searchParams.append("q[designer_id_in][]", designerId);
  url.searchParams.set("commit", "Search");
  return url.toString();
}
