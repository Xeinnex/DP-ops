const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/client-activity.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, Date, Math });
const row = (name, day, active = false) => ({ client: { name }, tickets: active ? [{}] : [], lastActiveDay: day });
const rows = [row("Old", "2026-10-09"), row("Unknown"), row("Recent", "2026-10-16"), row("Z active", "2026-10-18", true), row("A active", "2026-10-01", true)];
rows.sort(api.compareClientAllocation);
assert.equal(rows.map(row => row.client.name).join(","), "A active,Z active,Recent,Old,Unknown");
assert.equal(api.lastActiveLabel("2026-10-16", "2026-10-19"), "3 days ago");
assert.equal(api.lastActiveLabel("2026-10-09", "2026-10-19"), "10 days ago");
assert.equal(api.lastActiveLabel("2026-10-19", "2026-10-19"), "Today");
assert.equal(api.lastActiveLabel("2026-09-30", "2026-10-01"), "1 day ago");
assert.equal(api.lastActiveLabel(undefined, "2026-10-19"), "No history");
console.log("Client activity checks passed: inactive recency order, active alphabetical order, unknown history, calendar-day labels.");

assert.equal(api.lastActiveLabel("2026-07-01", "2026-10-19"), "60+ days");
