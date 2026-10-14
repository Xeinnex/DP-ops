import { allowedRequestOrigin } from "@/lib/request-origin";
import { dailyData, setOutsideStatus } from "@/lib/database";
import { validDay } from "@/lib/daily";
import { outsideStatuses } from "@/lib/outside-tickets";

export async function POST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (!validDay(body.day) || typeof body.entryId !== "string" || (body.status !== null && !outsideStatuses.includes(body.status))) throw new Error("Invalid outside-team status request.");
    setOutsideStatus(body.day, body.entryId, body.status);
    return Response.json(dailyData(body.day));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update status." }, { status: 400 }); }
}
