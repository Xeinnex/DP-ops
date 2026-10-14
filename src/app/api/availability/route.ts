import { dailyData, setCreativeAvailability } from "@/lib/database";
import { today } from "@/lib/daily";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.creativeId !== "string" || !["available", "half_day", "away"].includes(body.availability)) throw new Error("Choose Available, Half Day, or Away.");
    setCreativeAvailability(body.creativeId, body.availability);
    return Response.json(dailyData(today()));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update availability." }, { status: 400 }); }
}
