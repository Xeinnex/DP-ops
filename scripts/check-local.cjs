const assert = require("node:assert/strict");

async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3100";
  for (const path of ["/", "/tickets", "/clients", "/creative-tickets", "/creatives", "/dashboard", "/ticket-log"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("DP-Ops"));
    assert.ok(!html.includes("_dpp_session_id_production"), "Cookie leaked into page HTML");
    console.log(`${path}: HTTP 200, cookie absent from HTML`);
  }
  const blocked = await fetch(base + "/api/tickets", { method: "POST", headers: { Origin: "https://example.com" } });
  assert.equal(blocked.status, 403);
  if (process.argv.includes("--saved-only")) {
    for (const source of ["clients", "creatives"]) {
      const response = await fetch(base + `/api/tickets?source=${source}&teamId=347`);
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.ok(saved && Array.isArray(saved.tickets));
      console.log(`Saved ${source} queue after restart: ${saved.tickets.length} tickets, no scrape requested.`);
    }
    return;
  }
  const response = await fetch(base + "/api/tickets", { method: "POST", headers: { Origin: base }, signal: AbortSignal.timeout(300000) });
  const data = await response.json();
  if (response.ok) console.log(`Live fetch passed: ${data.tickets.length} tickets across ${data.pagesFetched} pages.`);
  else { console.log(`Live fetch: HTTP ${response.status}; ${data.error}`); process.exitCode = 1; }
  const crewResponse = await fetch(base + "/api/tickets?source=creatives&teamId=347", { method: "POST", headers: { Origin: base }, signal: AbortSignal.timeout(300000) });
  const crew = await crewResponse.json();
  if (crewResponse.ok) {
    assert.ok(crew.tickets.every((ticket) => ticket.sources.includes("creatives")));
    console.log(`Team 347 fetch passed: ${crew.tickets.length} tickets across ${crew.pagesFetched} pages.`);
  } else { console.log(`Team fetch: HTTP ${crewResponse.status}; ${crew.error}`); process.exitCode = 1; }
  const invalid = await fetch(base + "/api/tickets?source=creatives&teamId=invalid", { method: "POST" });
  assert.equal(invalid.status, 400);
  for (const [source, expected] of [["clients", data], ["creatives", crew]]) {
    if (!Array.isArray(expected.tickets)) continue;
    const saved = await (await fetch(base + `/api/tickets?source=${source}&teamId=347`)).json();
    assert.equal(saved.tickets.length, expected.tickets.length);
    assert.equal(saved.fetchedAt, expected.fetchedAt);
  }
  const dashboard = await (await fetch(base + "/api/dashboard")).json();
  assert.equal(new Set(dashboard.tickets.map((ticket) => ticket.entryId || ticket.id)).size, dashboard.tickets.length);
  assert.equal(dashboard.clients.length, 39);
  assert.equal(dashboard.creatives.length, 8);
  console.log(`Persistence verified: saved queues reload without scraping; daily dashboard has ${dashboard.tickets.length} unique tickets.`);
  const history = await (await fetch(base + "/api/ticket-log")).json();
  assert.ok(history.total >= 2);
  assert.ok(history.runs.every((run) => Array.isArray(run.payload.tickets)));
  assert.ok(!JSON.stringify(history).includes("_dpp_session_id_production"));
  console.log(`Raw history verified: ${history.total} saved fetches; no cookie values present.`);
  const mutation = async (body) => {
    const response = await fetch(base + "/api/registry", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  };
  const clientId = "99999999001";
  const creativeId = "dp-ops-verification-creative";
  assert.ok(!dashboard.clients.some((client) => client.id === clientId));
  assert.ok(!dashboard.creatives.some((creative) => creative.id === creativeId));
  try {
    await mutation({ kind: "clients", id: clientId, name: "Verification client", dailyMinutes: 120, pc: "NO PC" });
    const edited = await mutation({ kind: "clients", id: clientId, name: "Verification client", dailyMinutes: 180, pc: "PC" });
    assert.equal(edited.clients.find((client) => client.id === clientId).dailyMinutes, 180);
    await mutation({ kind: "creatives", id: creativeId, name: "Verification creative", alias: "Verification", scopes: ["GD", "PD"], capacityMinutes: 405 });
    const reloaded = await (await fetch(base + "/api/registry")).json();
    assert.equal(reloaded.creatives.find((creative) => creative.id === creativeId).scopes.join(","), "GD,PD");
    console.log("Registry API verified: add, edit, reload, and remove clients/creatives.");
  } finally {
    await mutation({ kind: "clients", id: clientId, action: "delete" });
    await mutation({ kind: "creatives", id: creativeId, action: "delete" });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
