import { dailyData } from "@/lib/database";
import { today, validDay } from "@/lib/daily";

export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day") || today();
  if (!validDay(day)) return Response.json({ error: "Invalid date." }, { status: 400 });
  return Response.json(dailyData(day), { headers: { "Cache-Control": "no-store" } });
}
