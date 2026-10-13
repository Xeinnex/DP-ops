const assert = require("node:assert/strict");

async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3000";
  const post = (body, origin = base) => fetch(`${base}/api/design-time`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await post({}, "https://example.com")).status, 403);
  const data = await (await fetch(`${base}/api/dashboard`)).json();
  assert.ok(Array.isArray(data.tickets));
  const invalid = await post({ day: data.day, entryId: "999999999999999:1", designTime: "1:99" });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /H:MM/);
  const missing = await post({ day: data.day, entryId: "999999999999999:1", designTime: "1:30" });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error, "Daily work entry not found.");
  const history = await (await fetch(`${base}/api/ticket-log`)).json();
  assert.ok(Array.isArray(history.designTimeEdits));
  const preserved = data.tickets.filter((ticket) => ticket.dtLocked && ticket.designTime && ticket.designTime !== "0:00");
  console.log(`DT route checks passed: origin/format/entry validation, ${preserved.length} saved entries with locked DT, correction history available. No DT changed or tickets fetched.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
