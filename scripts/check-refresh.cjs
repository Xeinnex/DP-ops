const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (id) => dependencies[id] || require(id), Map, Set, Intl, Date });
  return exports;
}
const daily = load("src/lib/daily.ts");
const status = load("src/lib/ticket-status.ts", { "@/lib/design-time": load("src/lib/design-time.ts") });
const progress = load("src/lib/creative-progress.ts", { "@/lib/ticket-status": status, "@/lib/creative-work": load("src/lib/creative-work.ts", { "@/lib/daily": daily }) });
async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3100";
  const denied = await fetch(base + "/api/refresh", { method: "POST", headers: { Origin: "https://example.com" } });
  assert.equal(denied.status, 403);
  const before = await (await fetch(base + "/api/dashboard")).json();
  const response = await fetch(base + "/api/refresh", { method: "POST", headers: { Origin: base }, signal: AbortSignal.timeout(300000) });
  const body = await response.json();
  assert.equal(response.status, 200, body.error);
  assert.equal(new Set(body.data.tickets.map((ticket) => ticket.entryId)).size, body.data.tickets.length);
  assert.ok(body.data.tickets.every((ticket) => ticket.completion >= 0 && ticket.completion <= 1));
  const saved = await (await fetch(base + "/api/dashboard")).json();
  assert.equal(saved.tickets.length, body.data.tickets.length);
  assert.deepEqual(saved.previousProgress, body.data.previousProgress);
  if (before.fetched.length || before.tickets.length) {
    const expected = progress.creativeProgress(before);
    assert.deepEqual(body.data.previousProgress.map(({ capturedAt, ...values }) => { assert.ok(capturedAt); return values; }), JSON.parse(JSON.stringify(expected)));
    console.log("Previous progress verified: captured before both source fetches and persisted for the selected day.");
  }
  const log = await (await fetch(base + "/api/ticket-log")).json();
  assert.ok(Array.isArray(log.detailChecks));
  console.log(`Combined refresh passed: ${body.data.tickets.length} daily entries, ${body.checked} missing-ticket status checks, ${body.warnings.length} warnings.`);
  for (const warning of body.warnings) console.log(warning);
  console.log("Status decisions and detail checks reload from SQLite.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
