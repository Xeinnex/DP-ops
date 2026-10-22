const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-ops-teams-'));
const originalPath = process.env.DP_DB_PATH;
process.env.DP_DB_PATH = path.join(directory, 'test.sqlite');
// Simulate a deployed workspace with a manually added creative before upgrade.
const legacy = new (require('better-sqlite3'))(process.env.DP_DB_PATH + '.T09.sqlite');
legacy.exec("CREATE TABLE creatives(id TEXT PRIMARY KEY,name TEXT NOT NULL,alias TEXT NOT NULL,scopes TEXT NOT NULL,capacityMinutes INTEGER NOT NULL,designerId TEXT,availability TEXT NOT NULL DEFAULT 'available')");
legacy.prepare('INSERT INTO creatives VALUES (?,?,?,?,?,?,?)').run('manual-jocelyn', 'Jocelyn Eunice Salazar Cazares', 'Jocelyn', '["GD"]', 405, '1424', 'half_day');
legacy.close();
const cache = new Map();
const globals = {};
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const dependencies = (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
    if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
    return require(id);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: dependencies, process, globalThis: globals, Map, Set, Date, Intl, Request, Response, URL, Buffer });
  return exports;
}
(async () => {
  try {
    const context = load('src/lib/team-context.ts');
    const database = load('src/lib/database.ts');
    const report = load('src/lib/chat-report.ts');
    const availability = load('src/lib/availability.ts');
    for (const assigned of [435, 450]) {
      const bar = availability.bandwidthBar(assigned, 420, 420);
      assert.equal(bar.limit, assigned);
      assert.equal(bar.assignedPercent, 100);
      assert.ok(bar.completedPercent < 100, 'Completed bar must not fill before all overtime work is done');
      assert.equal(availability.bandwidthBar(assigned, assigned, 420).completedPercent, 100);
    }
    assert.equal(availability.bandwidthBar(210, 105, 420).assignedPercent, 50);
    assert.equal(availability.bandwidthBar(0, 0, 0).completedPercent, 0);
    assert.equal(availability.bandwidthBar(120, 60, 0).completedPercent, 50);
    assert.equal(availability.bandwidthBar(240, 120, 225).completedPercent, 50);
    const request = (code) => new Request('http://localhost/api/dashboard', { headers: { 'X-DP-Team': code } });
    const run = (code, task) => context.withTeam(async () => { await task(); return Response.json({ ok: true }); })(request(code));
    await run('T04', async () => {
      assert.equal(database.registry().clients.length, 39);
      assert.equal(database.registry().creatives.length, 8);
      // Exercise the upgrade of persisted 6:45 records, not only fresh seeds.
      database.db().prepare("DELETE FROM settings WHERE key='seven_hour_capacity_v1'").run();
      database.db().prepare('UPDATE creatives SET capacityMinutes=405').run();
      database.db().close();
      assert.ok(database.registry().creatives.every(creative => creative.capacityMinutes === 420));
      database.db().prepare("INSERT INTO settings VALUES ('isolation-test','T04')").run();
    });
    await run('T09', async () => {
      const registry = database.registry();
      assert.equal(context.teamQueueId(), '41');
      assert.equal(registry.clients.length, 46);
      assert.equal(registry.clients.filter(c => c.pc === 'PC').length, 9);
      assert.ok(registry.clients.every(c => /^\d+$/.test(c.companyId)));
      assert.equal(new Set(registry.clients.map(c => c.companyId)).size, 46);
      assert.equal(registry.creatives.length, 9);
      assert.ok(registry.creatives.every(creative => creative.capacityMinutes === 420));
      assert.equal(registry.creatives.find(creative => creative.designerId === '1424').id, 'manual-jocelyn');
      assert.equal(registry.creatives.find(creative => creative.designerId === '1424').availability, 'half_day');
      assert.ok(registry.creatives.find(creative => creative.alias === 'Viridiana').scopes.includes('FIG'));
      for (const creative of registry.creatives) assert.ok(fs.existsSync(`public/profile-pictures/PP-${creative.alias}.webp`), `Missing profile picture: ${creative.alias}`);
      assert.equal(database.db().prepare("SELECT value FROM settings WHERE key='isolation-test'").get(), undefined);
      database.db().prepare("INSERT INTO settings VALUES ('isolation-test','T09')").run();
      const day = load('src/lib/daily.ts').today();
      const ticket = { id: '123', client: registry.clients.find(client => client.pc === 'PC').name, clientId: registry.clients.find(client => client.pc === 'PC').companyId, assignee: 'Example', title: 'T09 only', status: 'In Progress', sources: ['clients'], designTime: '1:00', position: 1, url: 'https://jar.designpickle.com/admin/tickets/123' };
      database.saveFetch({ tickets: [ticket], fetchedAt: new Date().toISOString(), pagesFetched: 1, warnings: [] }, 'clients', 'clients', day);
      const data = database.dailyData(day);
      assert.ok(data.tickets.some(t => t.id === '123'));
      const result = report.buildChatReport({ ...data, tickets: data.tickets.map(ticket => ({ ...ticket, outsideStatus: "In Progress" })) }, context.activeTeam().code);
      assert.ok(result.messages[0].startsWith('*T09 - PC Report*'));
      assert.equal(result.ticketCount, 1);
    });
    await Promise.all(['T04', 'T09'].map(code => run(code, async () => {
      await new Promise(resolve => setTimeout(resolve, code === 'T04' ? 20 : 5));
      assert.equal(context.activeTeam().code, code);
      assert.equal(database.db().prepare("SELECT value FROM settings WHERE key='isolation-test'").get().value, code);
      if (code === 'T04') assert.ok(!database.dailyData().tickets.some(t => t.id === '123'));
    })));
    assert.equal((await run('T99', async () => assert.fail('Unknown teams must be rejected'))).status, 400);
    await run('T09', async () => {
      database.db().prepare("DELETE FROM creatives WHERE alias='Gelby'").run();
      database.db().prepare("UPDATE creatives SET capacityMinutes=390 WHERE id='manual-jocelyn'").run();
      database.db().close();
      assert.equal(database.registry().creatives.length, 8, 'Deleted creatives must not reappear on restart');
      assert.equal(database.registry().creatives.find(creative => creative.id === 'manual-jocelyn').capacityMinutes, 390, 'Migration must not repeat after a later manual edit');
    });
    console.log('Team isolation, workbook migration, profile links, seven-hour capacity, restart persistence, overtime bars, and report labels passed.');
  } finally {
    for (const connection of globals.dpTeamDatabases?.values() || []) if (connection.open) connection.close();
    if (originalPath === undefined) delete process.env.DP_DB_PATH; else process.env.DP_DB_PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
