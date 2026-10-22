import { withTeam } from "@/lib/team-context";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { companyIdFromQueue, clientNameFromQueue } from "@/lib/client-lookup";
import { clientTicketsUrl } from "@/lib/queue-links";

async function handlePOST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.url !== "string") throw new Error("Paste a client queue URL.");
    const companyId = companyIdFromQueue(body.url);
    const cookie = process.env.DP_COOKIE?.trim();
    if (!cookie) throw new Error("DP_COOKIE is missing.");
    const response = await fetch(clientTicketsUrl(companyId)!, { headers: { Cookie: cookie, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Client lookup returned HTTP ${response.status}. Check your cookie and access.`);
    const name = clientNameFromQueue(await response.text(), companyId);
    if (!name) throw new Error(`Company ID ${companyId} was read, but the company name was not found. Check the queue URL and website access.`);
    return Response.json({ companyId, name });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Client lookup failed." }, { status: 400 }); }
}

export const POST = withTeam(handlePOST);
