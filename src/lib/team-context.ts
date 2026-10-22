import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { findTeam, teams, type Team } from "@/data/teams";

const context = new AsyncLocalStorage<Team>();
export function activeTeam() { return context.getStore() ?? teams[0]; }
export function teamQueueId() {
  const id = activeTeam().queueId || process.env[`DP_${activeTeam().code}_TEAM_ID`]?.trim();
  if (!id || !/^\d+$/.test(id)) throw new Error(`Configure DP_${activeTeam().code}_TEAM_ID with this team's numeric JAR ID before fetching queues.`);
  return id;
}
// Missing queue IDs must never fall back to another team's queue.
export function savedTeamScope() { return activeTeam().queueId || process.env[`DP_${activeTeam().code}_TEAM_ID`]?.trim() || activeTeam().code; }
export function withTeam(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const code = request.headers.get("X-DP-Team") ?? (await cookies()).get("dp-team")?.value ?? "T04";
    const team = findTeam(code);
    if (!team) return Response.json({ error: "Unknown team." }, { status: 400 });
    return context.run(team, () => handler(request));
  };
}
