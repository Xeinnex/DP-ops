import { db, registry } from "@/lib/database";
import { normalizeName } from "@/lib/daily";
import { connection } from "next/server";

export async function GET() { await connection(); return Response.json(registry(), { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${new URL(request.url).protocol}//${request.headers.get("host")}`) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json();
    if (!["clients", "creatives"].includes(body.kind) || typeof body.id !== "string" || !body.id.trim()) throw new Error("Invalid record.");
    const table = body.kind === "clients" ? "clients" : "creatives";
    if (body.action === "delete") {
      db().prepare(`DELETE FROM ${table} WHERE id=?`).run(body.id);
      return Response.json(registry());
    }
    if (typeof body.name !== "string" || !body.name.trim()) throw new Error("Name is required.");
    if (table === "clients") {
      if (!/^\d+$/.test(body.id) || !Number.isInteger(body.dailyMinutes) || body.dailyMinutes < 0 || !["NO PC", "PC", "PC AD"].includes(body.pc)) throw new Error("Provide a numeric company ID, nonnegative daily time, and subscription type.");
      const companyId = body.companyId ?? registry().clients.find((client) => client.id === body.id)?.companyId ?? body.id;
      if (typeof companyId !== "string" || !/^\d+$/.test(companyId)) throw new Error("Company ID must contain digits only.");
      if (registry().clients.some((client) => client.id !== body.id && (client.companyId || client.id) === companyId)) throw new Error("That company ID already belongs to another client.");
      db().prepare("INSERT INTO clients(id,name,dailyMinutes,pc,companyId) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,dailyMinutes=excluded.dailyMinutes,pc=excluded.pc,companyId=excluded.companyId").run(body.id, body.name.trim(), body.dailyMinutes, body.pc, companyId);
    } else {
      if (typeof body.alias !== "string" || !body.alias.trim() || !Array.isArray(body.scopes) || !body.scopes.every((scope: unknown) => typeof scope === "string" && ["GD", "PD", "FIG", "CI", "MG", "VE"].includes(scope)) || !Number.isInteger(body.capacityMinutes) || body.capacityMinutes <= 0) throw new Error("Provide an alias, valid scopes, and positive capacity.");
      if (registry().creatives.some((creative) => creative.id !== body.id && (normalizeName(creative.name) === normalizeName(body.name) || normalizeName(creative.alias) === normalizeName(body.alias)))) throw new Error("That creative name or alias already exists.");
      const designerId = body.designerId === undefined ? registry().creatives.find((creative) => creative.id === body.id)?.designerId ?? null : body.designerId === "" || body.designerId === null ? null : body.designerId;
      if (designerId !== null && (typeof designerId !== "string" || !/^\d+$/.test(designerId))) throw new Error("Designer ID must contain digits only, or be left blank.");
      if (designerId && registry().creatives.some((creative) => creative.id !== body.id && creative.designerId === designerId)) throw new Error("That designer ID already belongs to another creative.");
      db().prepare("INSERT INTO creatives(id,name,alias,scopes,capacityMinutes,designerId) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,alias=excluded.alias,scopes=excluded.scopes,capacityMinutes=excluded.capacityMinutes,designerId=excluded.designerId").run(body.id, body.name.trim(), body.alias.trim(), JSON.stringify([...new Set(body.scopes)]), body.capacityMinutes, designerId);
    }
    return Response.json(registry());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save record." }, { status: 400 }); }
}
