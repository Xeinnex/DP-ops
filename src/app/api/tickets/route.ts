import { savedTeamScope, teamQueueId } from "@/lib/team-context";
import { withTeam } from "@/lib/team-context";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { savedTickets } from "@/lib/database";
import { syncSource, withQueueLock } from "@/lib/queue-sync";
import { today, validDay } from "@/lib/daily";

async function handleGET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") || "clients";
  const scope = source === "creatives" ? savedTeamScope() : "clients";
  const day = params.get("day") || today();
  if (!validDay(day) || !["clients", "creatives"].includes(source)) return Response.json({ error: "Invalid queue or date." }, { status: 400 });
  return Response.json(savedTickets(source, scope, day), { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const source = params.get("source") || "clients";
  const teamId = savedTeamScope();
  if (!["clients", "creatives"].includes(source)) return Response.json({ error: "Invalid queue or team ID." }, { status: 400 });
  const day = today();
  try {
    await withQueueLock(() => syncSource(source as "clients" | "creatives", teamQueueId(), day));
    return Response.json(savedTickets(source, source === "creatives" ? teamId : "clients", day), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ticket fetch failed." }, { status: 502 }); }
}

export const GET = withTeam(handleGET);

export const POST = withTeam(handlePOST);
