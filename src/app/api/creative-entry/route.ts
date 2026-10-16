import { allowedRequestOrigin } from "@/lib/request-origin";
import { dailyData, hideCreativeEntry } from "@/lib/database";
import { validDay } from "@/lib/daily";

export async function POST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (!validDay(body.day) || typeof body.entryId !== "string" || typeof body.assignee !== "string") throw new Error("Provide a daily work entry and creative.");
    hideCreativeEntry(body.day, body.entryId, body.assignee);
    return Response.json(dailyData(body.day));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to remove creative entry." }, { status: 400 }); }
}
