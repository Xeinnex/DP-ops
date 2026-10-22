import { withTeam } from "@/lib/team-context";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { setManualCompletion, dailyData } from "@/lib/database";
import { validDay } from "@/lib/daily";

async function handlePOST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (!validDay(body.day) || typeof body.entryId !== "string" || typeof body.complete !== "boolean") throw new Error("Invalid completion request.");
    setManualCompletion(body.day, body.entryId, body.complete);
    return Response.json(dailyData(body.day));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update completion." }, { status: 400 }); }
}

export const POST = withTeam(handlePOST);
