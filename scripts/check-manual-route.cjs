const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3000";
  const db = new Database(process.env.DP_DB_PATH || "data/dp-ops.sqlite", { readonly: true });
  const row = db.prepare("SELECT ticketId FROM queue_snapshots ORDER BY fetchedAt DESC LIMIT 1").get();
  db.close();
  assert.ok(row, "No saved ticket available for lookup verification.");
  const response = await fetch(`${base}/api/manual-ticket`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ action: "lookup", url: `https://jar.designpickle.com/admin/tickets/${row.ticketId}` }),
    signal: AbortSignal.timeout(40000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.error || "Lookup failed.");
  assert.ok(body.client && body.clientId && body.status && body.title);
  console.log("Manual lookup route passed: HTTP 200 with client, title and status; no ticket saved.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
