const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), true);
const parser = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/ticket-parser.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: parser, require });

async function main() {
  const Database = require("better-sqlite3");
  const db = new Database(process.env.DP_DB_PATH || "data/dp-ops.sqlite", { readonly: true });
  const clients = db.prepare("SELECT COALESCE(companyId,id) AS id FROM clients ORDER BY name").all();
  db.close();
  const clientUrl = new URL("https://jar.designpickle.com/admin/tickets");
  clients.forEach((client) => clientUrl.searchParams.append("q[company_id_in][]", client.id));
  clientUrl.searchParams.set("q[ticket_status]", "active");
  const crewUrl = new URL(process.env.DP_CREATIVE_QUEUE_URL || "https://jar.designpickle.com/admin/tickets?q%5Bstate_in%5D%5B%5D=1&q%5Bstate_in%5D%5B%5D=2&q%5Bstate_in%5D%5B%5D=3&q%5Bstate_in%5D%5B%5D=4");
  crewUrl.searchParams.delete("q[designer_qr_team_id_in][]");
  crewUrl.searchParams.append("q[designer_qr_team_id_in][]", "347");
  const urls = [{ source: "clients", url: clientUrl }, { source: "creatives", url: crewUrl }];
  fs.writeFileSync(".next/queue-urls.txt", urls.map(({ source, url }) => `${source}\n${url}\n`).join("\n"));
  if (process.argv.includes("--verify")) {
    const load = (file, dependencies = {}) => {
      const exports = {};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (id) => id in dependencies ? dependencies[id] : require(id), URL, process, fetch, AbortSignal, Map, Set });
      return exports;
    };
    const scraper = load("src/lib/ticket-scraper.ts", { "server-only": {}, "@/lib/ticket-parser": parser, "@/data/clients": load("src/data/clients.ts"), "@/data/team": load("src/data/team.ts") });
    for (const { source, url } of urls) {
      const result = await scraper.scrapeTickets({ source, teamId: "347", clientUrl: url.toString() });
      console.log(`${source}: ${result.tickets.length} tickets across ${result.pagesFetched} pages; no data saved.`);
    }
    return;
  }
  for (const { source, url: base } of urls) {
    console.log(`${source} FULL URL: ${base}`);
    for (let page = 1; page <= 3; page++) {
      const url = new URL(base); if (page > 1) url.searchParams.set("page", String(page));
      if (url.origin !== "https://jar.designpickle.com") throw new Error("Unexpected queue origin.");
      const response = await fetch(url, { headers: { Cookie: process.env.DP_COOKIE, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
      const html = await response.text();
      const parsed = parser.parseTicketPage(html, source);
      const $ = require("cheerio").load(html);
      console.log(JSON.stringify({ source, page, rowCount: parsed.rowCount, tickets: parsed.tickets.length, next: parsed.nextLink, pagination: $(".pagination").first().text().replace(/\s+/g, " ").trim(), links: $(".pagination a[rel], .pagination .next a").map((_, link) => ({ label: $(link).text().trim(), href: $(link).attr("href"), rel: $(link).attr("rel") })).get() }));
      if (!parsed.nextLink && parsed.rowCount < 25) break;
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
