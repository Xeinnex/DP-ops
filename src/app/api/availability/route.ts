import { withTeam } from "@/lib/team-context";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { dailyData, setCreativeAvailability } from "@/lib/database";
import { today } from "@/lib/daily";

async function handlePOST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.creativeId !== "string" || !["available", "half_day", "away"].includes(body.availability)) throw new Error("Choose Available, Half Day, or Away.");
    setCreativeAvailability(body.creativeId, body.availability);
    return Response.json(dailyData(today()));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update availability." }, { status: 400 }); }
}

export const POST = withTeam(handlePOST);
