import { allowedRequestOrigin } from "@/lib/request-origin";
import { syncDashboard, withQueueLock } from "@/lib/queue-sync";
import { dailyData } from "@/lib/database";
import { today } from "@/lib/daily";

export async function POST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const day = today();
  try {
    const result = await withQueueLock(() => syncDashboard(day));
    return Response.json({ ...result, data: dailyData(day) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Queue refresh failed. Any successful source was saved." }, { status: 502 }); }
}
