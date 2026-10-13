const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(path, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: (id) => id in dependencies ? dependencies[id] : require(id), URL, process, fetch: (...args) => global.fetch(...args), AbortSignal, Response, Map, Set });
  return exports;
}

const parser = loadTs("src/lib/ticket-parser.ts");
const registry = loadTs("src/data/clients.ts");
const team = loadTs("src/data/team.ts");
assert.equal(team.creatives.length, 8);
assert.equal(team.creativeAlias("Muhammad Triadi Santoso Azis"), "Andrew");
assert.equal(team.creativeAlias("Martin Ignacio Butchart Reyes"), "Nacho");
assert.equal(team.creativeAlias(" Diana  Carolina Rodríguez Nino "), "Diana");
assert.equal(team.creativeAlias("Other creative"), "Other creative");
assert.equal(new URL(team.creativeQueueUrl()).searchParams.get("q[designer_qr_team_id_in][]"), "347");
assert.equal(new URL(team.creativeQueueUrl("999")).searchParams.get("q[designer_qr_team_id_in][]"), "999");
const time = loadTs("src/lib/design-time.ts");
assert.equal(time.designTimeMinutes("Not Set"), 0);
assert.equal(time.designTimeMinutes(null), 0);
assert.equal(time.designTimeMinutes("0:00"), 0);
assert.equal(time.designTimeMinutes("1:45"), 105);
assert.equal(time.designTimeMinutes("1:99"), 0);
assert.equal(time.formatDesignTime(1575), "26:15");
assert.equal(time.totalDesignTime([{ designTime: "1:45" }, { designTime: "0:30" }, { designTime: "Not Set" }, { designTime: null }]), "2:15");
const grouped = time.groupTicketsByClient([{ client: "Zebra", id: "1" }, { client: "Acme", id: "2" }, { client: "Zebra", id: "3" }]);
assert.equal(grouped[0][0], "Acme");
assert.equal(grouped[1][1].length, 2);
assert.equal(registry.clients.length, 39);
assert.equal(new Set(registry.clients.map((client) => client.id)).size, 39);
assert.equal(new URL(registry.clientQueueUrl()).searchParams.getAll("q[company_id_in][]").length, 39);

function page(id = "123456", extra = "") {
  return `<table><tbody><tr><td><a href="/admin/companies/108848">148 COMMUNICATIONS LLC</a></td><td><a href="/admin/tickets/${id}">#${id} Summer &amp; autumn</a></td><td><select aria-label="State"><option>Wrong</option><option selected>In Progress</option></select></td><td>2</td><td><select aria-label="Design Time"><option selected="selected">1:30</option></select></td><td></td><td></td><td><select aria-label="Creative"><option selected>Alex</option></select></td></tr></tbody></table>${extra}`;
}
const parsed = parser.parseTicketPage(page(), "clients");
assert.equal(parsed.tickets[0].title, "Summer & autumn");
assert.equal(parsed.tickets[0].status, "In Progress");
assert.equal(parsed.tickets[0].assignee, "Alex");
assert.equal(parsed.tickets[0].designTime, "1:30");
assert.equal(parsed.tickets[0].timeSpentMinutes, null);
assert.equal(parsed.tickets[0].position, 2);
const unsetReview = parser.parseTicketPage(page().replace("In Progress", "Customer Review").replace("1:30", "Not Set"), "clients");
assert.equal(unsetReview.tickets.length, 1);
assert.equal(unsetReview.tickets[0].status, "Customer Review");
assert.equal(time.totalDesignTime(unsetReview.tickets), "0:00");
assert.throws(() => parser.parseTicketPage('<input type="password">', "clients"), /Session expired/);
assert.throws(() => parser.parseTicketPage("<html>Unexpected page</html>", "clients"), /table not found/);
assert.equal(parser.parseTicketPage("<table><tbody></tbody></table>", "clients").tickets.length, 0);

const scraper = loadTs("src/lib/ticket-scraper.ts", {
  "server-only": {}, "@/data/clients": registry, "@/data/team": team, "@/lib/ticket-parser": parser,
});

async function main() {
  const saved = { cookie: process.env.DP_COOKIE, client: process.env.DP_CLIENT_QUEUE_URL, creative: process.env.DP_CREATIVE_QUEUE_URL, fetch: global.fetch };
  try {
    process.env.DP_COOKIE = "fixture-session";
    delete process.env.DP_CLIENT_QUEUE_URL;
    process.env.DP_CREATIVE_QUEUE_URL = "https://jar.designpickle.com/admin/tickets?q[designer_qr_team_id_in][]=123";
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push(url.toString());
      assert.equal(options.redirect, "manual");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers.Cookie, "fixture-session");
      if (url.searchParams.has("q[designer_qr_team_id_in][]")) return new Response(page());
      return new Response(url.searchParams.get("page") === "2" ? page("123457") : page("123456", '<a rel="next" href="?page=2">Next</a>'));
    };
    const result = await scraper.scrapeTickets();
    assert.equal(result.tickets.length, 2);
    assert.equal(result.pagesFetched, 3);
    assert.equal(result.tickets[0].sources.join(","), "clients,creatives");
    assert.equal(new URL(requests[1]).searchParams.getAll("q[company_id_in][]").length, 39);
    requests.length = 0;
    const crew = await scraper.scrapeTickets({ source: "creatives", teamId: "999" });
    assert.equal(crew.tickets.length, 1);
    assert.equal(new URL(requests[0]).searchParams.get("q[designer_qr_team_id_in][]"), "999");
    requests.length = 0;
    await scraper.scrapeTickets({ source: "clients" });
    assert.ok(requests.every((url) => !new URL(url).searchParams.has("q[designer_qr_team_id_in][]")));
    global.fetch = async () => new Response("", { status: 302, headers: { Location: "/users/sign_in" } });
    await assert.rejects(scraper.scrapeTickets(), /cookie was not accepted/);
    global.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(scraper.scrapeTickets(), /HTTP 403.*does not necessarily/);
    global.fetch = async () => new Response("", { status: 302, headers: { Location: "/admin" } });
    await assert.rejects(scraper.scrapeTickets(), /unexpected redirect/);
    global.fetch = async () => new Response(page("123456", '<a rel="next" href="?page=2">Next</a>'));
    await assert.rejects(scraper.scrapeTickets(), /repeated a page/);
    process.env.DP_CLIENT_QUEUE_URL = "https://example.com/admin/tickets";
    await assert.rejects(scraper.scrapeTickets(), /Queue URL must point/);
    delete process.env.DP_COOKIE;
    await assert.rejects(scraper.scrapeTickets(), /Set DP_COOKIE/);
    console.log("Scraper checks passed: registry, fields, pagination, deduplication, expired session, repeated pages, URL restrictions, missing cookie.");
  } finally {
    for (const [key, value] of [["DP_COOKIE", saved.cookie], ["DP_CLIENT_QUEUE_URL", saved.client], ["DP_CREATIVE_QUEUE_URL", saved.creative]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    global.fetch = saved.fetch;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
