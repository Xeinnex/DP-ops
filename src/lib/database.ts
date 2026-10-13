import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clients as seedClients } from "@/data/clients";
import { creatives as seedCreatives } from "@/data/team";
import type { Registry, ClientRecord, CreativeRecord, DailyData } from "@/types/operations";
import type { Ticket, TicketResult } from "@/types/ticket";
import { today } from "@/lib/daily";
import { applyObservation, statusKey, type WorkEntry } from "@/lib/ticket-status";

let connection: Database.Database | undefined;

export function db() {
  if (connection) return connection;
  const filename = resolve(/* turbopackIgnore: true */ process.env.DP_DB_PATH || "data/dp-ops.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  connection = new Database(filename);
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, dailyMinutes INTEGER NOT NULL, pc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS creatives (id TEXT PRIMARY KEY, name TEXT NOT NULL, alias TEXT NOT NULL, scopes TEXT NOT NULL, capacityMinutes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS queue_snapshots (day TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL, ticketId TEXT NOT NULL, payload TEXT NOT NULL, active INTEGER NOT NULL, fetchedAt TEXT NOT NULL, PRIMARY KEY(day,source,scope,ticketId));
    CREATE TABLE IF NOT EXISTS fetch_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL, fetchedAt TEXT NOT NULL, pages INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshot_day ON queue_snapshots(day,active);
    CREATE TABLE IF NOT EXISTS worked_tickets (day TEXT NOT NULL, ticketId TEXT NOT NULL, assignee TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(day,ticketId,assignee));
    CREATE TABLE IF NOT EXISTS detail_checks (day TEXT NOT NULL,ticketId TEXT NOT NULL,checkedAt TEXT NOT NULL,status TEXT,error TEXT,PRIMARY KEY(day,ticketId));
    CREATE TABLE IF NOT EXISTS status_observations (id INTEGER PRIMARY KEY AUTOINCREMENT,day TEXT NOT NULL,ticketId TEXT NOT NULL,fetchedAt TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS manual_completions (day TEXT NOT NULL,entryId TEXT NOT NULL,completedAt TEXT NOT NULL,PRIMARY KEY(day,entryId));
  `);
  if (!connection.prepare("SELECT value FROM settings WHERE key='seeded'").get()) {
    connection.transaction(() => {
      const clientInsert = connection!.prepare("INSERT INTO clients VALUES (@id,@name,@dailyMinutes,@pc)");
      const hours: Record<string, number> = { "104329": 8, "84083": 8, "19155": 6, "7789": 1, "12925": 1, "91457": 33, "19001": 1, "78615": 14, "89744": 3, "94907": 3 };
      for (const client of seedClients) clientInsert.run({ ...client, dailyMinutes: (hours[client.id] ?? 2) * 60, pc: ["104329", "84083", "91457", "78615"].includes(client.id) ? "PC AD" : client.id === "19155" ? "PC" : "NO PC" });
      const scopes: Record<string, string[]> = { Ailen: ["GD", "PD", "FIG"], Diana: ["GD"], Edgar: ["GD", "PD"], Faisal: ["GD"], Haqqy: ["CI", "GD"], Juanes: ["MG"], Andrew: ["VE"], Nacho: ["GD"] };
      const creativeInsert = connection!.prepare("INSERT INTO creatives VALUES (@id,@name,@alias,@scopes,@capacityMinutes)");
      for (const creative of seedCreatives) creativeInsert.run({ ...creative, id: creative.alias.toLowerCase(), scopes: JSON.stringify(scopes[creative.alias]), capacityMinutes: 405 });
      connection!.prepare("INSERT INTO settings VALUES ('seeded','1')").run();
    })();
  }
  return connection;
}

export function registry(): Registry {
  const clients = db().prepare("SELECT * FROM clients ORDER BY name").all() as ClientRecord[];
  const rows = db().prepare("SELECT * FROM creatives ORDER BY alias").all() as (Omit<CreativeRecord, "scopes"> & { scopes: string })[];
  return { clients, creatives: rows.map((row) => ({ ...row, scopes: JSON.parse(row.scopes) })) };
}

export function saveFetch(result: TicketResult, source: string, scope: string, day = today()) {
  db().transaction(() => {
    db().prepare("UPDATE queue_snapshots SET active=0 WHERE day=? AND source=? AND scope=?").run(day, source, scope);
    const upsert = db().prepare("INSERT INTO queue_snapshots VALUES (?,?,?,?,?,1,?) ON CONFLICT(day,source,scope,ticketId) DO UPDATE SET payload=excluded.payload,active=1,fetchedAt=excluded.fetchedAt");
    for (const ticket of result.tickets) upsert.run(day, source, scope, ticket.id, JSON.stringify(ticket), result.fetchedAt);
    for (const ticket of result.tickets) db().prepare("DELETE FROM detail_checks WHERE day=? AND ticketId=?").run(day, ticket.id);
    db().prepare("INSERT INTO fetch_runs(day,source,scope,fetchedAt,pages,payload) VALUES (?,?,?,?,?,?)").run(day, source, scope, result.fetchedAt, result.pagesFetched, JSON.stringify(result));
  })();
}

export function savedTickets(source: string, scope: string, day = today()): TicketResult | null {
  const run = db().prepare("SELECT * FROM fetch_runs WHERE day=? AND source=? AND scope=? ORDER BY id DESC LIMIT 1").get(day, source, scope) as { fetchedAt: string; pages: number; payload: string } | undefined;
  const manual = dailyTickets(day, source === "creatives" ? scope : "347").filter((ticket) => ticket.manuallyAdded);
  if (!run) return manual.length ? { tickets: manual, fetchedAt: (db().prepare("SELECT MAX(fetchedAt) AS at FROM fetch_runs WHERE day=? AND source='manual'").get(day) as { at: string }).at, pagesFetched: 0, warnings: [] } : null;
  const rows = db().prepare("SELECT ticketId,active FROM queue_snapshots WHERE day=? AND source=? AND scope=?").all(day, source, scope) as { ticketId: string; active: number }[];
  const latest = dailyTickets(day, source === "creatives" ? scope : "347");
  const tickets = rows.flatMap((row) => latest.filter((ticket) => ticket.id === row.ticketId).map((ticket) => ({ ...ticket, sources: Array.from(new Set([...ticket.sources, source as "clients" | "creatives"])), retained: !row.active })));
  return { tickets: [...tickets, ...manual.filter((entry) => !tickets.some((ticket) => ticket.entryId === entry.entryId))], fetchedAt: run.fetchedAt, pagesFetched: run.pages, warnings: JSON.parse(run.payload).warnings };
}

function dailyTickets(day: string, teamId = "347") {
  // Replay immutable observations, including pre-upgrade history; revisions get separate daily entry IDs.
  const runs = db().prepare("SELECT payload,fetchedAt,id FROM fetch_runs WHERE day=? AND (source IN ('clients','manual') OR scope=?) ORDER BY id").all(day, teamId) as { payload: string; fetchedAt: string; id: number }[];
  const observations = runs.flatMap((run) => (JSON.parse(run.payload) as TicketResult).tickets.map((ticket) => ({ ticket, at: run.fetchedAt, order: run.id })));
  const eligible = new Set(observations.map(({ ticket }) => ticket.id));
  const details = db().prepare("SELECT payload,fetchedAt,id FROM status_observations WHERE day=? ORDER BY id").all(day) as { payload: string; fetchedAt: string; id: number }[];
  for (const detail of details) { const ticket: Ticket = JSON.parse(detail.payload); if (eligible.has(ticket.id)) observations.push({ ticket, at: detail.fetchedAt, order: 1000000000 + detail.id }); }
  observations.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  const entries = new Map<string, WorkEntry[]>();
  const overrides = new Map((db().prepare("SELECT entryId,completedAt FROM manual_completions WHERE day=?").all(day) as { entryId: string; completedAt: string }[]).map((row) => [row.entryId, row.completedAt]));
  const applyManual = (entry: WorkEntry, at?: string): WorkEntry => overrides.has(entry.entryId) && (!at || overrides.get(entry.entryId)! <= at) ? { ...entry, completion: ["canceled", "customer_clarification", "draft", "inactive"].includes(statusKey(entry.status)) ? 0 : 1, manualCompletion: true, lockedWip: statusKey(entry.status) === "incomplete" || entry.lockedWip } : entry;
  for (const { ticket, at } of observations) entries.set(ticket.id, applyObservation((entries.get(ticket.id) ?? []).map((entry) => applyManual(entry, at)), ticket));
  const active = new Set((db().prepare("SELECT DISTINCT ticketId FROM queue_snapshots WHERE day=? AND active=1 AND (source='clients' OR scope=?)").all(day, teamId) as { ticketId: string }[]).map((row) => row.ticketId));
  const manualIds = new Set(observations.filter(({ ticket }) => ticket.manuallyAdded).map(({ ticket }) => ticket.id));
  return [...entries.values()].flat().map((entry) => applyManual(entry)).filter((ticket) => !ticket.excluded).map((ticket) => ({ ...ticket, manuallyAdded: manualIds.has(ticket.id), retained: !active.has(ticket.id) }));
}

export function addManualTicket(ticket: Ticket) {
  const day = today();
  db().transaction(() => {
    if (dailyTickets(day).some((entry) => entry.id === ticket.id)) throw new Error("This ticket is already saved for today. Use its existing work entry to avoid counting DT twice.");
    const result: TicketResult = { tickets: [{ ...ticket, manuallyAdded: true }], fetchedAt: new Date().toISOString(), pagesFetched: 0, warnings: [] };
    db().prepare("INSERT INTO fetch_runs(day,source,scope,fetchedAt,pages,payload) VALUES (?,?,?,?,?,?)").run(day, "manual", "manual", result.fetchedAt, 0, JSON.stringify(result));
  })();
  return dailyData(day);
}

export function dailyData(day = today()): DailyData {
  const fetched = db().prepare("SELECT source,scope,MAX(fetchedAt) AS fetchedAt FROM fetch_runs WHERE day=? GROUP BY source,scope").all(day) as DailyData["fetched"];
  const workedTickets = (db().prepare("SELECT payload FROM worked_tickets WHERE day=?").all(day) as { payload: string }[]).map((row) => ({ ...JSON.parse(row.payload), worked: true }));
  return { ...registry(), day, tickets: dailyTickets(day), workedTickets, fetched };
}

export function markWorked(day: string, ticketId: string, assignee: string, worked: boolean) {
  if (!worked) { db().prepare("DELETE FROM worked_tickets WHERE day=? AND (ticketId=? OR json_extract(payload,'$.entryId')=?) AND assignee=?").run(day, ticketId, ticketId, assignee); return; }
  const ticket = dailyTickets(day).find((ticket) => (ticket.entryId === ticketId || (ticket.id === ticketId && ticket.occurrence === 1)) && ticket.assignee === assignee);
  if (!ticket || !assignee || /^(not assigned|unassigned)$/i.test(assignee)) throw new Error("Assigned ticket not found for that day.");
  db().prepare("INSERT INTO worked_tickets VALUES (?,?,?,?) ON CONFLICT(day,ticketId,assignee) DO UPDATE SET payload=excluded.payload").run(day, ticketId, assignee, JSON.stringify(ticket));
}

export function ticketHistory(day: string, ticketId: string, page = 1) {
  // Include later empty fetches for any source in which the ticket was observed, so departures are inspectable.
  const filter = ticketId ? " AND EXISTS(SELECT 1 FROM fetch_runs observed, json_each(observed.payload,'$.tickets') WHERE observed.day=fetch_runs.day AND observed.source=fetch_runs.source AND observed.scope=fetch_runs.scope AND json_extract(value,'$.id')=?)" : "";
  const args = ticketId ? [day, ticketId] : [day];
  const total = (db().prepare(`SELECT COUNT(*) AS total FROM fetch_runs WHERE day=?${filter}`).get(...args) as { total: number }).total;
  const rows = db().prepare(`SELECT id,day,source,scope,fetchedAt,pages,payload FROM fetch_runs WHERE day=?${filter} ORDER BY id DESC LIMIT 20 OFFSET ?`).all(...args, (page - 1) * 20) as { id: number; day: string; source: string; scope: string; fetchedAt: string; pages: number; payload: string }[];
  const detailChecks = db().prepare("SELECT ticketId,checkedAt,status,error FROM detail_checks WHERE day=? AND (?='' OR ticketId=?) ORDER BY checkedAt DESC").all(day, ticketId, ticketId);
  const statusObservations = (db().prepare("SELECT ticketId,fetchedAt,payload FROM status_observations WHERE day=? AND (?='' OR ticketId=?) ORDER BY id DESC").all(day, ticketId, ticketId) as { ticketId: string; fetchedAt: string; payload: string }[]).map((row) => ({ ...row, payload: JSON.parse(row.payload) as Ticket }));
  const entries = dailyTickets(day).filter((ticket) => !ticketId || ticket.id === ticketId);
  return { total, page, runs: rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as TicketResult })), detailChecks, statusObservations, entries };
}

export function missingStatusCandidates(day: string, visibleIds: Set<string>) {
  const checked = new Set((db().prepare("SELECT ticketId FROM detail_checks WHERE day=?").all(day) as { ticketId: string }[]).map((row) => row.ticketId));
  const latest = new Map(dailyTickets(day).map((ticket) => [ticket.id, ticket]));
  return [...latest.values()].filter((ticket) => !visibleIds.has(ticket.id) && !checked.has(ticket.id) && !ticket.lockedWip && !["customer_review", "closed", "archived", "canceled"].includes(statusKey(ticket.status)));
}

export function claimDetailCheck(day: string, ticketId: string) {
  return db().prepare("INSERT OR IGNORE INTO detail_checks(day,ticketId,checkedAt) VALUES (?,?,?)").run(day, ticketId, new Date().toISOString()).changes === 1;
}

export function setManualCompletion(day: string, entryId: string, complete: boolean) {
  if (!dailyTickets(day).some((ticket) => ticket.entryId === entryId)) throw new Error("Daily work entry not found.");
  if (complete) db().prepare("INSERT OR REPLACE INTO manual_completions VALUES (?,?,?)").run(day, entryId, new Date().toISOString());
  else db().prepare("DELETE FROM manual_completions WHERE day=? AND entryId=?").run(day, entryId);
}

export function saveDetailCheck(day: string, ticket: Ticket, status?: string, error?: string) {
  db().transaction(() => {
    db().prepare("UPDATE detail_checks SET status=?,error=? WHERE day=? AND ticketId=?").run(status ?? null, error ?? null, day, ticket.id);
    if (status) db().prepare("INSERT INTO status_observations(day,ticketId,fetchedAt,payload) VALUES (?,?,?,?)").run(day, ticket.id, new Date().toISOString(), JSON.stringify({ ...ticket, status }));
  })();
}
