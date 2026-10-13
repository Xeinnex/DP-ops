const assert = require("node:assert/strict");
async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3100";
  const denied = await fetch(base + "/api/refresh", { method: "POST", headers: { Origin: "https://example.com" } });
  assert.equal(denied.status, 403);
  const response = await fetch(base + "/api/refresh", { method: "POST", headers: { Origin: base }, signal: AbortSignal.timeout(300000) });
  const body = await response.json();
  assert.equal(response.status, 200, body.error);
  assert.equal(new Set(body.data.tickets.map((ticket) => ticket.entryId)).size, body.data.tickets.length);
  assert.ok(body.data.tickets.every((ticket) => ticket.completion >= 0 && ticket.completion <= 1));
  const saved = await (await fetch(base + "/api/dashboard")).json();
  assert.equal(saved.tickets.length, body.data.tickets.length);
  const log = await (await fetch(base + "/api/ticket-log")).json();
  assert.ok(Array.isArray(log.detailChecks));
  console.log(`Combined refresh passed: ${body.data.tickets.length} daily entries, ${body.checked} missing-ticket status checks, ${body.warnings.length} warnings.`);
  for (const warning of body.warnings) console.log(warning);
  console.log("Status decisions and detail checks reload from SQLite.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
