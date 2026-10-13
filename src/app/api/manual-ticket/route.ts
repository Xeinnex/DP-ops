import { addManualTicket, registry } from "@/lib/database";
import { fetchTicketDetail } from "@/lib/ticket-scraper";
import { manualStatuses, ticketIdFromUrl } from "@/lib/manual-ticket";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.url !== "string" || !["lookup", "add"].includes(body.action)) throw new Error("Invalid manual ticket request.");
    const id = ticketIdFromUrl(body.url);
    const creative = body.action === "add" ? registry().creatives.find((creative) => creative.id === body.creativeId) : undefined;
    if (body.action === "add" && (!creative || typeof body.designTime !== "string" || !/^\d{1,4}:[0-5]\d$/.test(body.designTime) || !manualStatuses.includes(body.status))) throw new Error("Choose a team creative, a valid status, and DT in H:MM format (for example 1:30).");
    const detail = await fetchTicketDetail(id);
    const client = registry().clients.find((client) => client.id === detail.clientId);
    if (body.action === "lookup") return Response.json({ ...detail, client: client?.name || detail.client, id });
    return Response.json(addManualTicket({ id, client: client?.name || detail.client, clientId: detail.clientId, title: detail.title, assignee: creative!.name, status: body.status, designTime: body.designTime, position: null, timeSpentMinutes: null, url: `https://jar.designpickle.com/admin/tickets/${id}`, sources: ["clients", "creatives"] }));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to add ticket." }, { status: 400 }); }
}
