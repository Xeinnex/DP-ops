import { markWorked, dailyData } from "@/lib/database";
import { validDay } from "@/lib/daily";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (!validDay(body.day) || typeof body.ticketId !== "string" || typeof body.assignee !== "string" || typeof body.worked !== "boolean") throw new Error("Invalid worked ticket record.");
    markWorked(body.day, body.ticketId, body.assignee, body.worked);
    return Response.json(dailyData(body.day));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to mark ticket." }, { status: 400 }); }
}
