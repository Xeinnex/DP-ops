import { clientHistory } from "@/lib/database";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("clientId") || "";
  const page = Number(params.get("page") || 1);
  if (!/^\d+$/.test(clientId) || !Number.isInteger(page) || page < 1) return Response.json({ error: "Invalid client or page." }, { status: 400 });
  try { return Response.json(clientHistory(clientId, page), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load history." }, { status: 404 }); }
}
