import type { DailyData } from "@/types/operations";
import type { Ticket } from "@/types/ticket";
import { statusKey } from "@/lib/ticket-status";
import { simplifiedStatus } from "@/lib/outside-tickets";
import { normalizeName } from "@/lib/daily";

export function reportStatus(ticket: Ticket) {
  const key = statusKey(ticket.status);
  if (["canceled", "draft", "inactive"].includes(key)) return null;
  if (key === "customer_clarification") return "Customer Clarification";
  const status = simplifiedStatus(ticket);
  if (status === "Delivered") return ["customer_review", "closed", "archived"].includes(key) ? "Delivered CR" : "Delivered WIP";
  return status;
}

// Prevent source text from introducing formatting, links, mentions, or new rows.
function plain(value: string) {
  return value.replace(/[<>|*_~`]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildChatReport(data: DailyData) {
  const latest = new Map<string, Ticket>();
  // Current daily entries supersede legacy saved work; later cycles supersede earlier ones.
  for (const ticket of [...data.workedTickets, ...data.tickets].sort((a, b) => (a.occurrence ?? 1) - (b.occurrence ?? 1))) latest.set(ticket.id, ticket);
  const grouped = new Map<string, { name: string; tickets: Ticket[] }>();
  for (const ticket of latest.values()) {
    const status = reportStatus(ticket);
    if (!status || status === "Assigned") continue;
    const client = data.clients.find((client) => ticket.clientId ? [client.id, client.companyId].includes(ticket.clientId) : normalizeName(client.name) === normalizeName(ticket.client));
    if (!client || !["PC", "PC AD"].includes(client.pc)) continue;
    const key = client.id;
    const group = grouped.get(key) || { name: client.name, tickets: [] };
    group.tickets.push(ticket);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  const count = groups.reduce((sum, group) => sum + group.tickets.length, 0);
  const header = `*T04 - PC Report*\n📅 ${data.day} · ${count} tickets · ${groups.length} clients`;
  // Stay comfortably below Chat's 32 KB message limit, including Unicode text.
  const limit = 28000;
  const messages: string[] = [];
  let text = header;
  const statusOrder = ["Delivered CR", "Delivered WIP", "In Progress", "Customer Clarification"];
  for (const group of groups) {
    const heading = `\n\n----------\n\n*${plain(group.name)}* (${group.tickets.length})\n`;
    let first = true;
    let clarificationStarted = false;
    for (const ticket of group.tickets.sort((a, b) => statusOrder.indexOf(reportStatus(a)!) - statusOrder.indexOf(reportStatus(b)!) || a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      if (!/^\d+$/.test(ticket.id)) throw new Error("A ticket has an invalid ID; report was not sent.");
      const status = reportStatus(ticket)!;
      const emoji = { Assigned: "📋", "In Progress": "🛠️", "Delivered WIP": "✅", "Delivered CR": "✅", "Customer Clarification": "❓" }[status];
      const clarification = status === "Customer Clarification";
      const row = `${clarification && !clarificationStarted ? "\n" : ""}\n🎟️ <https://jar.designpickle.com/admin/tickets/${ticket.id}|${ticket.id} - ${plain(ticket.title)}> — ${emoji} *${status}*`;
      const prefix = first ? heading : "";
      if (Buffer.byteLength(`${header}${heading}${row}`, "utf8") > limit) throw new Error("A ticket is too long for Google Chat; report was not sent.");
      if (Buffer.byteLength(text + prefix + row, "utf8") > limit) {
        messages.push(text);
        text = `${header}\n_Continued_${heading}${row}`;
      } else text += prefix + row;
      first = false;
      clarificationStarted ||= clarification;
    }
  }
  if (!count) text += "\n\nNo reportable tickets saved for today.";
  messages.push(text);
  return { messages, ticketCount: count, clientCount: groups.length };
}
