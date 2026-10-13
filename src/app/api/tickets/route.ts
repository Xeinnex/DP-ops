import { savedTickets } from "@/lib/database";
import { syncSource, withQueueLock } from "@/lib/queue-sync";
import { today, validDay } from "@/lib/daily";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") || "clients";
  const scope = source === "creatives" ? params.get("teamId") || "347" : "clients";
  const day = params.get("day") || today();
  if (!validDay(day) || !["clients", "creatives"].includes(source) || (source === "creatives" && !/^\d+$/.test(scope))) return Response.json({ error: "Invalid queue or date." }, { status: 400 });
  return Response.json(savedTickets(source, scope, day), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const source = params.get("source") || "clients";
  const teamId = params.get("teamId") || "347";
  if (!["clients", "creatives"].includes(source) || !/^\d+$/.test(teamId)) return Response.json({ error: "Invalid queue or team ID." }, { status: 400 });
  const day = today();
  try {
    await withQueueLock(() => syncSource(source as "clients" | "creatives", teamId, day));
    return Response.json(savedTickets(source, source === "creatives" ? teamId : "clients", day), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ticket fetch failed." }, { status: 502 }); }
}
