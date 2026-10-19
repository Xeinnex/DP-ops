import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { clients as seedClients } from "@/data/clients";
import { creatives as seedCreatives } from "@/data/team";
import type { Registry, ClientRecord, CreativeRecord, DailyData, CreativeAvailability } from "@/types/operations";
import type { Ticket, TicketResult } from "@/types/ticket";
import { today, normalizeName } from "@/lib/daily";
import { applyObservation, statusKey, type WorkEntry } from "@/lib/ticket-status";
import { creativeProgress } from "@/lib/creative-progress";
import { creativeWork } from "@/lib/creative-work";
import { outsideTeam, outsideStatuses, type OutsideStatus } from "@/lib/outside-tickets";
import { historyCutoff } from "@/lib/history-retention";

let connection: Database.Database | undefined;
const databaseCache = globalThis as typeof globalThis & { dpDatabase?: Database.Database; dpDatabaseSchema?: number };
const databaseSchema = 5;

export function db() {
  if (connection?.open && databaseCache.dpDatabaseSchema === databaseSchema) { maintainLogs(connection); return connection; }
  if (databaseCache.dpDatabase?.open && databaseCache.dpDatabaseSchema === databaseSchema) { connection = databaseCache.dpDatabase; maintainLogs(connection); return connection; }
  const filename = resolve(/* turbopackIgnore: true */ process.env.DP_DB_PATH || "data/dp-ops.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  connection = databaseCache.dpDatabase?.open ? databaseCache.dpDatabase : new Database(filename);
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
    CREATE TABLE IF NOT EXISTS design_time_edits (id INTEGER PRIMARY KEY AUTOINCREMENT,day TEXT NOT NULL,entryId TEXT NOT NULL,designTime TEXT NOT NULL,editedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS previous_progress (day TEXT NOT NULL,creativeId TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(day,creativeId));
    CREATE TABLE IF NOT EXISTS daily_availability (day TEXT NOT NULL,creativeId TEXT NOT NULL,availability TEXT NOT NULL,PRIMARY KEY(day,creativeId));
    CREATE TABLE IF NOT EXISTS outside_statuses (day TEXT NOT NULL,entryId TEXT NOT NULL,assignee TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(day,entryId,assignee));
    CREATE TABLE IF NOT EXISTS ticket_controls (day TEXT NOT NULL,entryId TEXT NOT NULL,assignee TEXT NOT NULL,delivered INTEGER,noBandwidth INTEGER NOT NULL DEFAULT 0,designTime TEXT,PRIMARY KEY(day,entryId,assignee));
    CREATE TABLE IF NOT EXISTS hidden_creative_entries (day TEXT NOT NULL,entryId TEXT NOT NULL,assignee TEXT NOT NULL,PRIMARY KEY(day,entryId,assignee));
    CREATE TABLE IF NOT EXISTS client_activity_summary (clientId TEXT PRIMARY KEY,lastDay TEXT NOT NULL);
  `);
  const clientColumns = connection.prepare("PRAGMA table_info(clients)").all() as { name: string }[];
  if (!clientColumns.some((column) => column.name === "companyId")) connection.exec("ALTER TABLE clients ADD COLUMN companyId TEXT");
  const creativeColumns = connection.prepare("PRAGMA table_info(creatives)").all() as { name: string }[];
  const addedDesignerId = !creativeColumns.some((column) => column.name === "designerId");
  if (addedDesignerId) connection.exec("ALTER TABLE creatives ADD COLUMN designerId TEXT");
  if (!creativeColumns.some((column) => column.name === "availability")) connection.exec("ALTER TABLE creatives ADD COLUMN availability TEXT NOT NULL DEFAULT 'available'");
  if (!connection.prepare("SELECT value FROM settings WHERE key='seeded'").get()) {
    connection.transaction(() => {
      const clientInsert = connection!.prepare("INSERT INTO clients(id,name,dailyMinutes,pc) VALUES (@id,@name,@dailyMinutes,@pc)");
      const hours: Record<string, number> = { "104329": 8, "84083": 8, "19155": 6, "7789": 1, "12925": 1, "91457": 33, "19001": 1, "78615": 14, "89744": 3, "94907": 3 };
      for (const client of seedClients) clientInsert.run({ ...client, dailyMinutes: (hours[client.id] ?? 2) * 60, pc: ["104329", "84083", "91457", "78615"].includes(client.id) ? "PC AD" : client.id === "19155" ? "PC" : "NO PC" });
      const scopes: Record<string, string[]> = { Ailen: ["GD", "PD", "FIG"], Diana: ["GD"], Edgar: ["GD", "PD"], Faisal: ["GD"], Haqqy: ["CI", "GD"], Juanes: ["MG"], Andrew: ["VE"], Nacho: ["GD"] };
      const creativeInsert = connection!.prepare("INSERT INTO creatives(id,name,alias,scopes,capacityMinutes,designerId) VALUES (@id,@name,@alias,@scopes,@capacityMinutes,@designerId)");
      for (const creative of seedCreatives) creativeInsert.run({ ...creative, designerId: creative.designerId ?? null, id: creative.alias.toLowerCase(), scopes: JSON.stringify(scopes[creative.alias]), capacityMinutes: 405 });
      connection!.prepare("INSERT INTO settings VALUES ('seeded','1')").run();
    })();
  }
  if (addedDesignerId) connection.prepare("UPDATE creatives SET designerId='5371' WHERE alias='Edgar' AND name='Edgar Jean-Pierre Torres Chamorro'").run();
  databaseCache.dpDatabase = connection;
  databaseCache.dpDatabaseSchema = databaseSchema;
  maintainLogs(connection);
  return connection;
}

function maintainLogs(database: Database.Database, day = today(), force = false) {
  if (!force && (database.prepare("SELECT value FROM settings WHERE key='logs_pruned_on'").get() as { value: string } | undefined)?.value === day) return;
  const cutoff = historyCutoff(day);
  const previousDay = new Date(Date.parse(`${cutoff}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  database.transaction(() => {
    const clients = database.prepare("SELECT id,COALESCE(companyId,id) AS companyId,name,dailyMinutes,pc FROM clients").all() as ClientRecord[];
    const activity = clientActivity(previousDay, clients, database);
    for (const [clientId, lastDay] of Object.entries(activity)) database.prepare("INSERT INTO client_activity_summary VALUES (?,?) ON CONFLICT(clientId) DO UPDATE SET lastDay=MAX(lastDay,excluded.lastDay)").run(clientId, lastDay);
    for (const table of ["fetch_runs", "queue_snapshots", "status_observations", "worked_tickets", "detail_checks", "manual_completions", "design_time_edits", "previous_progress", "daily_availability", "outside_statuses", "ticket_controls", "hidden_creative_entries"]) database.prepare(`DELETE FROM ${table} WHERE day<?`).run(cutoff);
    database.prepare("INSERT INTO settings VALUES ('logs_pruned_on',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(day);
  })();
}

export function pruneOldLogs(day = today()) { maintainLogs(db(), day, true); }

export function registry(): Registry {
  const clients = db().prepare("SELECT id,COALESCE(companyId,id) AS companyId,name,dailyMinutes,pc FROM clients ORDER BY name").all() as ClientRecord[];
  const rows = db().prepare("SELECT * FROM creatives ORDER BY alias").all() as (Omit<CreativeRecord, "scopes"> & { scopes: string })[];
  return { clients, creatives: rows.map((row) => ({ ...row, scopes: JSON.parse(row.scopes) })) };
}

export function saveFetch(result: TicketResult, source: string, scope: string, day = today()) {
  db().transaction(() => {
    for (const creative of registry().creatives) db().prepare("INSERT OR IGNORE INTO daily_availability VALUES (?,?,?)").run(day, creative.id, creative.availability || "available");
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

function dailyTickets(day: string, teamId = "347", references?: Ticket[], includeExcluded = false) {
  // Replay immutable observations, including pre-upgrade history; revisions get separate daily entry IDs.
  const runs = db().prepare("SELECT payload,fetchedAt,id FROM fetch_runs WHERE day=? AND (source IN ('clients','manual') OR scope=?) ORDER BY id").all(day, teamId) as { payload: string; fetchedAt: string; id: number }[];
  const observations = runs.flatMap((run) => (JSON.parse(run.payload) as TicketResult).tickets.map((ticket) => ({ ticket, at: run.fetchedAt, order: run.id })));
  const eligible = new Set(observations.filter(({ ticket }) => !ticket.independentManual).map(({ ticket }) => ticket.id));
  const details = db().prepare("SELECT payload,fetchedAt,id FROM status_observations WHERE day=? ORDER BY id").all(day) as { payload: string; fetchedAt: string; id: number }[];
  for (const detail of details) { const ticket: Ticket = JSON.parse(detail.payload); if (eligible.has(ticket.id)) observations.push({ ticket, at: detail.fetchedAt, order: 1000000000 + detail.id }); }
  observations.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  const entries = new Map<string, WorkEntry[]>();
  const assignments = new Map<string, WorkEntry>();
  const overrides = new Map((db().prepare("SELECT entryId,completedAt FROM manual_completions WHERE day=?").all(day) as { entryId: string; completedAt: string }[]).map((row) => [row.entryId, row.completedAt]));
  const edits = db().prepare("SELECT entryId,designTime,editedAt FROM design_time_edits WHERE day=? ORDER BY id").all(day) as { entryId: string; designTime: string; editedAt: string }[];
  const applyManual = (entry: WorkEntry, at?: string): WorkEntry => {
    const edit = edits.findLast((edit) => edit.entryId === entry.entryId && (!at || edit.editedAt <= at));
    const corrected = edit ? { ...entry, designTime: edit.designTime, manualDesignTime: true } : entry;
    return overrides.has(entry.entryId) && (!at || overrides.get(entry.entryId)! <= at) ? { ...corrected, completion: ["canceled", "customer_clarification", "draft", "inactive"].includes(statusKey(entry.status)) ? 0 : 1, manualCompletion: true, dtLocked: true, dtFrozen: true, lockedWip: statusKey(entry.status) === "incomplete" || entry.lockedWip } : corrected;
  };
  for (const { ticket, at } of observations) {
    const key = ticket.independentManual ? ticket.entryId! : ticket.id;
    const reduced = applyObservation((entries.get(key) ?? []).map((entry) => applyManual(entry, at)), ticket);
    const next = reduced.map((entry, index) => ({ ...entry, observedAt: index === reduced.length - 1 ? at : entry.observedAt, ...(ticket.independentManual ? { entryId: ticket.entryId!, occurrence: ticket.occurrence || 1 } : {}) }));
    entries.set(key, next);
    for (const entry of next) if (entry.assignee && !/^(not assigned|unassigned|none)$/i.test(entry.assignee)) {
      const identity = `${entry.entryId}\0${entry.assignee}`;
      const previous = assignments.get(identity);
      assignments.set(identity, ["customer_clarification", "draft", "inactive", "canceled"].includes(statusKey(entry.status)) && entry.designTime === null && previous ? { ...entry, designTime: previous.designTime } : entry);
    }
  }
  const active = new Set((db().prepare("SELECT DISTINCT ticketId FROM queue_snapshots WHERE day=? AND active=1 AND (source='clients' OR scope=?)").all(day, teamId) as { ticketId: string }[]).map((row) => row.ticketId));
  const manualIds = new Set(observations.filter(({ ticket }) => ticket.manuallyAdded && !ticket.independentManual).map(({ ticket }) => ticket.id));
  const outsideOverrides = db().prepare("SELECT entryId,assignee,status FROM outside_statuses WHERE day=?").all(day) as { entryId: string; assignee: string; status: OutsideStatus }[];
  const creatives = registry().creatives;
  const controls = db().prepare("SELECT entryId,assignee,delivered,noBandwidth,designTime FROM ticket_controls WHERE day=?").all(day) as { entryId: string; assignee: string; delivered: number | null; noBandwidth: number; designTime: string | null }[];
  const decorate = (ticket: WorkEntry) => {
    const override = outsideTeam(ticket, creatives) ? outsideOverrides.find((row) => row.entryId === ticket.entryId && row.assignee === ticket.assignee) : undefined;
    const applies = override && !["canceled", "customer_clarification"].includes(statusKey(ticket.status));
    const control = controls.find((row) => row.entryId === ticket.entryId && row.assignee === ticket.assignee);
    const delivery = control && control.delivered !== null && !["canceled", "customer_clarification"].includes(statusKey(ticket.status));
    return { ...ticket, ...(applies ? { outsideStatus: override.status, completion: override.status === "Delivered" ? 1 : override.status === "In Progress" ? 0.5 : 0 } : {}), ...(delivery ? { deliveryOverride: Boolean(control.delivered), completion: control.delivered ? 1 : 0, dtLocked: true, dtFrozen: true, designTime: ticket.manualDesignTime ? ticket.designTime : control.designTime ?? ticket.designTime } : {}), noBandwidth: Boolean(control?.noBandwidth), manuallyAdded: ticket.independentManual || manualIds.has(ticket.id), retained: !ticket.independentManual && !active.has(ticket.id) };
  };
  if (references) references.push(...[...assignments.values()].map((entry) => decorate(applyManual(entry))));
  return [...entries.values()].flat().map((entry) => applyManual(entry)).filter((ticket) => includeExcluded || !ticket.excluded).map(decorate);
}

export function setTicketControl(day: string, entryId: string, action: "delivery" | "bandwidth", enabled: boolean) {
  const ticket = dailyTickets(day).find((entry) => entry.entryId === entryId);
  if (!ticket) throw new Error("Daily work entry not found.");
  if (action === "delivery") db().prepare("INSERT INTO ticket_controls(day,entryId,assignee,delivered,designTime) VALUES (?,?,?,?,?) ON CONFLICT(day,entryId,assignee) DO UPDATE SET delivered=excluded.delivered,designTime=excluded.designTime").run(day, entryId, ticket.assignee, Number(enabled), ticket.designTime);
  else db().prepare("INSERT INTO ticket_controls(day,entryId,assignee,noBandwidth) VALUES (?,?,?,?) ON CONFLICT(day,entryId,assignee) DO UPDATE SET noBandwidth=excluded.noBandwidth").run(day, entryId, ticket.assignee, Number(enabled));
}

export function setOutsideStatus(day: string, entryId: string, status: OutsideStatus | null) {
  if (status !== null && !outsideStatuses.includes(status)) throw new Error("Choose Assigned, In Progress, or Delivered.");
  const ticket = dailyTickets(day).find((entry) => entry.entryId === entryId);
  if (!ticket || !outsideTeam(ticket, registry().creatives)) throw new Error("Outside-team ticket not found for that day.");
  if (status === null) db().prepare("DELETE FROM outside_statuses WHERE day=? AND entryId=? AND assignee=?").run(day, entryId, ticket.assignee);
  else db().prepare("INSERT OR REPLACE INTO outside_statuses VALUES (?,?,?,?)").run(day, entryId, ticket.assignee, status);
}

export function addManualTicket(ticket: Ticket) {
  const day = today();
  appendManualTicket(ticket, day);
  return dailyData(day);
}

function appendManualTicket(ticket: Ticket, day: string) {
  db().transaction(() => {
    const occurrence = dailyTickets(day).filter((entry) => entry.id === ticket.id).reduce((max, entry) => Math.max(max, entry.occurrence || 1), 0) + 1;
    for (const creative of registry().creatives) db().prepare("INSERT OR IGNORE INTO daily_availability VALUES (?,?,?)").run(day, creative.id, creative.availability || "available");
    const result: TicketResult = { tickets: [{ ...ticket, entryId: `${ticket.id}:manual:${randomUUID()}`, occurrence, independentManual: true, manuallyAdded: true }], fetchedAt: new Date().toISOString(), pagesFetched: 0, warnings: [] };
    db().prepare("INSERT INTO fetch_runs(day,source,scope,fetchedAt,pages,payload) VALUES (?,?,?,?,?,?)").run(day, "manual", "manual", result.fetchedAt, 0, JSON.stringify(result));
  })();
}

export function restoreCreativeEntry(day: string, entryId: string, assignee: string) {
  db().transaction(() => {
    const data = dailyData(day);
    if (!data.creatives.some((creative) => creative.name === assignee)) throw new Error("Creative not found.");
    const ticket = creativeWork(data.tickets, data.workedTickets, assignee).find((entry) => entry.entryId === entryId);
    if (!ticket?.referenceOnly) throw new Error("Reference entry not found or already restored.");
    const status = ["customer_clarification", "draft", "inactive", "canceled"].includes(statusKey(ticket.status)) ? "Assigned" : ticket.completion === 1 ? "Customer Review" : ticket.status;
    appendManualTicket({ id: ticket.id, client: ticket.client, clientId: ticket.clientId, title: ticket.title, assignee, status, designTime: ticket.designTime, position: ticket.position, timeSpentMinutes: ticket.timeSpentMinutes, url: ticket.url, sources: ticket.sources }, day);
    db().prepare("INSERT OR IGNORE INTO hidden_creative_entries VALUES (?,?,?)").run(day, entryId, assignee);
  })();
}

export function dailyData(day = today()): DailyData {
  const fetched = db().prepare("SELECT source,scope,MAX(fetchedAt) AS fetchedAt FROM fetch_runs WHERE day=? GROUP BY source,scope").all(day) as DailyData["fetched"];
  const legacyWorked = (db().prepare("SELECT payload FROM worked_tickets WHERE day=?").all(day) as { payload: string }[]).map((row) => ({ ...JSON.parse(row.payload), worked: true } as Ticket));
  const references: Ticket[] = [];
  const tickets = dailyTickets(day, "347", references);
  const hidden = db().prepare("SELECT entryId,assignee FROM hidden_creative_entries WHERE day=?").all(day) as { entryId: string; assignee: string }[];
  const isHidden = (ticket: Ticket) => hidden.some((row) => row.entryId === ticket.entryId && row.assignee === ticket.assignee);
  const workedTickets = [...new Map([...legacyWorked, ...references].map((ticket) => [`${ticket.entryId || `${ticket.id}:1`}\0${ticket.assignee}`, ticket])).values()].map((ticket) => {
    const current = tickets.find((entry) => entry.entryId === ticket.entryId);
    return { ...ticket, referenceOnly: !current || current.assignee !== ticket.assignee || ["customer_clarification", "draft", "inactive", "canceled"].includes(statusKey(current.status)), currentAssignee: current?.assignee || "Not assigned", hiddenFromCreative: isHidden(ticket) };
  });
  const previousProgress = (db().prepare("SELECT payload FROM previous_progress WHERE day=?").all(day) as { payload: string }[]).map((row) => JSON.parse(row.payload));
  const records = registry();
  const availability = new Map((db().prepare("SELECT creativeId,availability FROM daily_availability WHERE day=?").all(day) as { creativeId: string; availability: CreativeAvailability }[]).map((row) => [row.creativeId, row.availability]));
  const creatives = records.creatives.map((creative) => ({ ...creative, availability: day === today() ? creative.availability : availability.get(creative.id) || "available" as CreativeAvailability }));
  return { ...records, creatives, day, tickets: tickets.map((ticket) => ({ ...ticket, hiddenFromCreative: isHidden(ticket) })), workedTickets, fetched, previousProgress, clientActivity: clientActivity(day, records.clients) };
}

function clientActivity(day: string, clients: ClientRecord[], database = db()) {
  const rows = database.prepare(`
    WITH observations AS (
      SELECT r.day, j.value AS ticket, 0 AS worked FROM fetch_runs r, json_each(r.payload,'$.tickets') j WHERE r.day<=@day
      UNION ALL SELECT day,payload,0 FROM status_observations WHERE day<=@day
      UNION ALL SELECT day,payload,1 FROM worked_tickets WHERE day<=@day
    ), activity AS (
      SELECT day,json_extract(ticket,'$.clientId') AS clientId,json_extract(ticket,'$.client') AS client FROM observations o
      WHERE worked=1
        OR replace(lower(json_extract(ticket,'$.status')),'_',' ') LIKE 'in progress%'
        OR replace(lower(json_extract(ticket,'$.status')),'_',' ') IN ('quality review','customer review','closed','archived')
        OR (replace(lower(json_extract(ticket,'$.status')),'_',' ')='incomplete'
          AND trim(COALESCE(json_extract(ticket,'$.assignee'),''))<>''
          AND lower(trim(json_extract(ticket,'$.assignee'))) NOT IN ('not assigned','unassigned','none')
          AND CAST(replace(json_extract(ticket,'$.designTime'),':','') AS INTEGER)>0)
        OR EXISTS (SELECT 1 FROM manual_completions m WHERE m.day=o.day AND substr(m.entryId,1,instr(m.entryId,':')-1)=json_extract(o.ticket,'$.id'))
        OR EXISTS (SELECT 1 FROM ticket_controls c WHERE c.day=o.day AND c.delivered=1 AND substr(c.entryId,1,instr(c.entryId,':')-1)=json_extract(o.ticket,'$.id'))
    ) SELECT clientId,client,MAX(day) AS lastDay FROM activity GROUP BY clientId,client
  `).all({ day }) as { clientId: string | null; client: string; lastDay: string }[];
  const result: Record<string, string> = {};
  for (const client of clients) for (const row of rows) {
    if ((row.clientId === client.id || row.clientId === (client.companyId || client.id) || normalizeName(row.client || "") === normalizeName(client.name)) && (!result[client.id] || row.lastDay > result[client.id])) result[client.id] = row.lastDay;
  }
  const archived = database.prepare("SELECT clientId,lastDay FROM client_activity_summary WHERE lastDay<=?").all(day) as { clientId: string; lastDay: string }[];
  for (const row of archived) if (!result[row.clientId] || row.lastDay > result[row.clientId]) result[row.clientId] = row.lastDay;
  return result;
}

export function clientHistory(clientId: string, page = 1) {
  const client = registry().clients.find((client) => client.id === clientId);
  if (!client) throw new Error("Client not found.");
  const through = today();
  const from = historyCutoff(through);
  const matches = (ticket: Ticket) => ticket.clientId === client.id || ticket.clientId === (client.companyId || client.id) || normalizeName(ticket.client || "") === normalizeName(client.name);
  const raw = new Map<string, { day: string; ticket: Ticket }[]>();
  const remember = (day: string, ticket: Ticket, at: string) => {
    if (matches(ticket)) raw.set(day, [...(raw.get(day) || []), { day, ticket: { ...ticket, observedAt: at } }]);
  };
  const runs = db().prepare("SELECT day,payload,fetchedAt FROM fetch_runs WHERE day>=? AND day<=? ORDER BY id").all(from, through) as { day: string; payload: string; fetchedAt: string }[];
  for (const run of runs) for (const ticket of (JSON.parse(run.payload) as TicketResult).tickets) remember(run.day, ticket, run.fetchedAt);
  const details = db().prepare("SELECT day,payload,fetchedAt FROM status_observations WHERE day>=? AND day<=? ORDER BY id").all(from, through) as { day: string; payload: string; fetchedAt: string }[];
  for (const detail of details) remember(detail.day, JSON.parse(detail.payload), detail.fetchedAt);
  const entries: (Ticket & { day: string })[] = [];
  for (const [day, observed] of raw) {
    const references: Ticket[] = [];
    const daily = dailyTickets(day, "347", references, true).filter(matches);
    const history = new Map<string, Ticket>();
    for (const ticket of [...references.filter(matches), ...daily]) history.set(`${ticket.entryId}\0${ticket.assignee}`, ticket);
    // Draft/Inactive first observations are deliberately excluded from workload,
    // but must still be visible in client history.
    const represented = new Set([...history.values()].map((ticket) => ticket.id));
    for (const { ticket } of observed) if (!represented.has(ticket.id)) history.set(`${ticket.id}:raw\0${ticket.assignee}`, { ...ticket, entryId: `${ticket.id}:raw:${ticket.assignee}` });
    for (const ticket of history.values()) entries.push({ ...ticket, day });
  }
  entries.sort((a, b) => b.day.localeCompare(a.day) || (b.observedAt || "").localeCompare(a.observedAt || "") || (b.occurrence || 1) - (a.occurrence || 1));
  return { client, from, through, page, total: entries.length, entries: entries.slice((page - 1) * 50, page * 50) };
}

export function hideCreativeEntry(day: string, entryId: string, assignee: string) {
  const data = dailyData(day);
  const ticket = [...data.tickets, ...data.workedTickets].find((ticket) => ticket.entryId === entryId && ticket.assignee === assignee);
  if (!ticket || !data.creatives.some((creative) => creative.name === assignee)) throw new Error("Creative work entry not found for that day.");
  db().prepare("INSERT OR IGNORE INTO hidden_creative_entries VALUES (?,?,?)").run(day, entryId, assignee);
}

export function setCreativeAvailability(creativeId: string, availability: CreativeAvailability) {
  if (!["available", "half_day", "away"].includes(availability)) throw new Error("Invalid availability.");
  db().transaction(() => {
    if (!db().prepare("UPDATE creatives SET availability=? WHERE id=?").run(availability, creativeId).changes) throw new Error("Creative not found.");
    db().prepare("INSERT OR REPLACE INTO daily_availability VALUES (?,?,?)").run(today(), creativeId, availability);
  })();
}

export function capturePreviousProgress(day: string) {
  const data = dailyData(day);
  db().transaction(() => {
    db().prepare("DELETE FROM previous_progress WHERE day=?").run(day);
    if (!data.fetched.length && !data.tickets.length) return;
    const capturedAt = new Date().toISOString();
    const insert = db().prepare("INSERT INTO previous_progress VALUES (?,?,?)");
    for (const progress of creativeProgress(data)) insert.run(day, progress.creativeId, JSON.stringify({ ...progress, capturedAt }));
  })();
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
  const designTimeEdits = db().prepare("SELECT entryId,designTime,editedAt FROM design_time_edits WHERE day=? AND (?='' OR entryId LIKE ?) ORDER BY id DESC").all(day, ticketId, `${ticketId}:%`);
  return { total, page, runs: rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as TicketResult })), detailChecks, statusObservations, entries, designTimeEdits };
}

export function setDesignTime(day: string, entryId: string, designTime: string) {
  if (!/^\d{1,4}:[0-5]\d$/.test(designTime)) throw new Error("Use DT in H:MM format, for example 1:30.");
  if (!dailyTickets(day).some((ticket) => ticket.entryId === entryId)) throw new Error("Daily work entry not found.");
  db().prepare("INSERT INTO design_time_edits(day,entryId,designTime,editedAt) VALUES (?,?,?,?)").run(day, entryId, designTime, new Date().toISOString());
}

export function missingStatusCandidates(day: string, visibleIds: Set<string>) {
  const checked = new Set((db().prepare("SELECT ticketId FROM detail_checks WHERE day=?").all(day) as { ticketId: string }[]).map((row) => row.ticketId));
  const latest = new Map(dailyTickets(day).filter((ticket) => !ticket.independentManual).map((ticket) => [ticket.id, ticket]));
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
