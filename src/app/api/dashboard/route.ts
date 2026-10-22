import { withTeam } from "@/lib/team-context";
import { dailyData } from "@/lib/database";
import { today, validDay } from "@/lib/daily";

async function handleGET(request: Request) {
  const day = new URL(request.url).searchParams.get("day") || today();
  if (!validDay(day)) return Response.json({ error: "Invalid date." }, { status: 400 });
  return Response.json(dailyData(day), { headers: { "Cache-Control": "no-store" } });
}

export const GET = withTeam(handleGET);
