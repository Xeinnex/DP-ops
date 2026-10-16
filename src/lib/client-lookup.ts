import { load } from "cheerio";

export function companyIdFromQueue(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Paste a valid client queue URL."); }
  const ids = [...url.searchParams.getAll("q[company_id_eq]"), ...url.searchParams.getAll("q[company_id_in][]")].filter(Boolean);
  if (url.origin !== "https://jar.designpickle.com" || url.pathname !== "/admin/tickets" || url.username || url.password || ids.length !== 1 || !/^\d+$/.test(ids[0])) throw new Error("Use a Design Pickle active queue URL for one company.");
  return ids[0];
}

export function clientNameFromQueue(html: string, companyId: string) {
  const $ = load(html);
  if ($('input[type="password"]').length) throw new Error("Session expired. Update DP_COOKIE.");
  const option = $("select").filter((_, select) => /company_id/.test($(select).attr("name") || "")).find("option").filter((_, option) => $(option).attr("value") === companyId).first();
  const link = $("a[href]").filter((_, link) => {
    try {
      const url = new URL($(link).attr("href")!, "https://jar.designpickle.com");
      return url.origin === "https://jar.designpickle.com" && (url.pathname === `/admin/companies/${companyId}` || (url.pathname === "/admin/companies" && url.searchParams.get("company_id") === companyId)) && !/^edit$/i.test($(link).text().trim());
    } catch { return false; }
  }).first();
  return (option.text() || link.text()).replace(/\s+/g, " ").trim();
}
