import { load } from "cheerio";
import type { Ticket } from "@/types/ticket";

export function parseTicketStatus(html: string): string {
  const $ = load(html);
  if ($('input[type="password"]').length) throw new Error("Ticket detail redirected to a sign-in page.");
  const badge = $('[aria-label="Ticket Status"]').first().text().replace(/\s+/g, " ").trim();
  const option = $('select[aria-label="State"] option[selected]').first();
  const status = badge || option.attr("data-label") || option.text().trim();
  if (!/^(Draft|Open(?: \(Revision\))?|Assigned|In Progress(?: \(paused\))?|Incomplete(?: \((?:WIP|Revision)\))?|Quality Review|Customer Review|Customer Clarification|Closed|Archived|Cancel[l]?ed|Inactive)$/i.test(status)) throw new Error("No recognized ticket status found in detail HTML.");
  return status;
}

export function parseTicketDetail(html: string) {
  const status = parseTicketStatus(html);
  const $ = load(html);
  const company = $('a[href]').filter((_, link) => {
    const href = $(link).attr("href") || "";
    return (/\/admin\/companies\/\d+(?:[/?#]|$)/.test(href) || /\/admin\/companies\?[^#]*\bcompany_id=\d+/.test(href)) && !/^edit\b/i.test($(link).text().trim());
  }).first();
  const clientId = company.attr("href")?.match(/(?:\/companies\/|[?&]company_id=)(\d+)/)?.[1];
  const client = company.text().replace(/\s+/g, " ").trim();
  if (!clientId || !client) throw new Error("Could not read the client from this ticket. Check the ticket page layout.");
  const title = $("h1").first().text().replace(/\s+/g, " ").trim() || $("title").text().trim() || "Untitled ticket";
  return { clientId, client, title, status };
}

export function parseTicketPage(html: string, source: "clients" | "creatives") {
  const $ = load(html);
  if ($('input[type="password"]').length) throw new Error("Session expired. Update DP_COOKIE in .env.local and restart the server.");
  const table = $("tbody").filter((_, body) => $(body).find('a[href*="/admin/tickets/"]').length > 0).first();
  const body = table.length ? table : $("tbody").first();
  if (!body.length) throw new Error("Ticket table not found. The session may have expired or the website layout changed.");
  const tickets: Ticket[] = [];
  const text = (value: string) => value.replace(/\s+/g, " ").trim();
  body.find("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (!cells.length) return;
    const ticketCell = cells.eq(1);
    const link = ticketCell.find('a[href*="/admin/tickets/"]').first();
    const id = link.attr("href")?.match(/\/tickets\/(\d+)/)?.[1] ?? ticketCell.text().match(/#(\d+)/)?.[1];
    if (!id) return;
    const selected = (selector: string) => text($(row).find(`${selector} option[selected]`).first().text());
    const stateOption = cells.eq(2).find("option[selected]").first();
    let state = text($(row).find('[aria-label="Ticket Status"]').first().text()) || stateOption.attr("data-label") || selected('select[aria-label="State"]') || text(stateOption.text()) || (cells.eq(2).find("select").length ? "Unknown" : text(cells.eq(2).text())) || "Unknown";
    const stateNote = cells.eq(2).clone().find("select").remove().end().text();
    if (/^open$/i.test(state) && /revision/i.test(stateNote)) state = "Open (Revision)";
    const companyLink = cells.eq(0).find('a[href*="/admin/companies"]').first();
    const clientId = companyLink.attr("href")?.match(/\/companies\/(\d+)/)?.[1];
    const client = text(companyLink.length ? companyLink.text() : cells.eq(0).text()).replace(/\([^)]*\)/g, "").trim();
    const title = text(link.text() || ticketCell.text()).replace(new RegExp(`^#?${id}\\s*[-:–]?\\s*`), "");
    const position = Number.parseInt(text(cells.eq(3).text()), 10);
    const designTime = selected('select[aria-label="Design Time"]');
    const assignee = selected('select[aria-label="Creative"]') || text(cells.eq(7).find("option[selected]").first().text());
    tickets.push({ id, client, clientId, title: title || "Untitled ticket", assignee: assignee && !/^unassigned$/i.test(assignee) ? assignee : "Not assigned", status: state, position: Number.isNaN(position) ? null : position, designTime: /^\d+:\d{2}$/.test(designTime) ? designTime : null, timeSpentMinutes: null, url: `https://jar.designpickle.com/admin/tickets/${id}`, sources: [source] });
  });
  if (!tickets.length && body.find('a[href*="/admin/tickets/"]').length) throw new Error("Ticket rows could not be parsed. The website layout changed.");
  const nextLink = $('a[rel="next"], .pagination .next:not(.disabled) a, .pagination a').filter((_, link) => $(link).attr("rel") === "next" || /^(next|next\s*[›»→]|[›»→])$/i.test(text($(link).text()))).first().attr("href");
  return { tickets, nextLink, rowCount: body.find("tr").filter((_, row) => $(row).children("td").length > 0).length };
}
