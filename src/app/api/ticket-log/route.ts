import { ticketHistory } from "@/lib/database";
import { today, validDay } from "@/lib/daily";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const day = params.get("day") || today();
  const ticketId = params.get("ticketId") || "";
  const page = Number(params.get("page") || 1);
  if (!validDay(day) || (ticketId && !/^\d+$/.test(ticketId)) || !Number.isInteger(page) || page < 1) return Response.json({ error: "Invalid date, ticket ID or page." }, { status: 400 });
  return Response.json(ticketHistory(day, ticketId, page), { headers: { "Cache-Control": "no-store" } });
}
