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
      db().prepare("INSERT INTO clients VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,dailyMinutes=excluded.dailyMinutes,pc=excluded.pc").run(body.id, body.name.trim(), body.dailyMinutes, body.pc);
    } else {
      if (typeof body.alias !== "string" || !body.alias.trim() || !Array.isArray(body.scopes) || !body.scopes.every((scope: unknown) => typeof scope === "string" && ["GD", "PD", "FIG", "CI", "MG", "VE"].includes(scope)) || !Number.isInteger(body.capacityMinutes) || body.capacityMinutes <= 0) throw new Error("Provide an alias, valid scopes, and positive capacity.");
      if (registry().creatives.some((creative) => creative.id !== body.id && (normalizeName(creative.name) === normalizeName(body.name) || normalizeName(creative.alias) === normalizeName(body.alias)))) throw new Error("That creative name or alias already exists.");
      db().prepare("INSERT INTO creatives VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,alias=excluded.alias,scopes=excluded.scopes,capacityMinutes=excluded.capacityMinutes").run(body.id, body.name.trim(), body.alias.trim(), JSON.stringify([...new Set(body.scopes)]), body.capacityMinutes);
    }
    return Response.json(registry());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save record." }, { status: 400 }); }
}
