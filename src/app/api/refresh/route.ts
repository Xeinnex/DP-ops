import { syncDashboard, withQueueLock } from "@/lib/queue-sync";
import { dailyData } from "@/lib/database";
import { today } from "@/lib/daily";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const day = today();
  try {
    const result = await withQueueLock(() => syncDashboard(day));
    return Response.json({ ...result, data: dailyData(day) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Queue refresh failed. Any successful source was saved." }, { status: 502 }); }
}
