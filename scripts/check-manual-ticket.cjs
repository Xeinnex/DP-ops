const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, URL, require: (id) => id in dependencies ? dependencies[id] : require(id) });
  return exports;
}
const manual = load("src/lib/manual-ticket.ts");
const parser = load("src/lib/ticket-parser.ts");
assert.equal(manual.ticketIdFromUrl("https://jar.designpickle.com/admin/tickets/123/?view=full"), "123");
for (const url of ["https://example.com/admin/tickets/123", "http://jar.designpickle.com/admin/tickets/123", "https://jar.designpickle.com.evil.com/admin/tickets/123", "https://user:pass@jar.designpickle.com/admin/tickets/123", "https://jar.designpickle.com/admin/tickets/123/edit", "file:///admin/tickets/123"]) assert.throws(() => manual.ticketIdFromUrl(url));
const detail = parser.parseTicketDetail('<h1>Campaign &amp; assets</h1><nav><a href="/admin/companies">Companies</a><a href="/admin/companies/104329">ASME</a></nav><div aria-label="Ticket Status">Customer Review</div>');
assert.equal(detail.clientId, "104329");
assert.equal(detail.client, "ASME");
assert.equal(detail.title, "Campaign & assets");
assert.equal(detail.status, "Customer Review");
const queryDetail = parser.parseTicketDetail('<h1>Campaign</h1><a href="/admin/companies?company_id=84083">Edit Company Notes</a><a href="/admin/companies?company_id=84083">Capital Sales Company</a><div aria-label="Ticket Status">Closed</div>');
assert.equal(queryDetail.clientId, "84083");
assert.equal(queryDetail.client, "Capital Sales Company");
assert.throws(() => parser.parseTicketDetail('<input type="password"><h1>Sign in</h1>'));
assert.throws(() => parser.parseTicketDetail('<div aria-label="Ticket Status">Customer Review</div>'));
console.log("Manual ticket checks passed: constrained URLs, detail client/title/status, expired session and missing client errors.");

if (process.argv.includes("--live")) {
  require("@next/env").loadEnvConfig(process.cwd());
  const Database = require("better-sqlite3");
  const db = new Database(process.env.DP_DB_PATH || "data/dp-ops.sqlite", { readonly: true });
  const row = db.prepare("SELECT ticketId FROM queue_snapshots ORDER BY fetchedAt DESC LIMIT 1").get();
  db.close();
  if (!row) throw new Error("No saved ticket available for lookup verification.");
  fetch(`https://jar.designpickle.com/admin/tickets/${row.ticketId}`, { headers: { Cookie: process.env.DP_COOKIE, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", signal: AbortSignal.timeout(30000) }).then(async (response) => {
    assert.equal(response.status, 200);
    const html = await response.text();
    try {
      const result = parser.parseTicketDetail(html);
      assert.ok(result.client && result.clientId && result.status && result.title);
      console.log("Live ticket detail lookup passed: client, title, and recognized status read successfully; no data saved.");
    } catch (error) {
      const $ = require("cheerio").load(html);
      console.log("Company link locations:", $('a[href*="compan"]').map((_, link) => ({ href: $(link).attr("href"), label: $(link).text().trim().slice(0, 100) })).get());
      throw error;
    }
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
