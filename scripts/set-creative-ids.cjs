const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const seed = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/data/team.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: seed });
const normalize = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

async function main() {
  const base = process.env.DP_CHECK_URL || "http://127.0.0.1:3000";
  const response = await fetch(`${base}/api/registry`);
  assert.equal(response.status, 200);
  const records = await response.json();
  const provided = seed.creatives.filter((creative) => creative.designerId);
  for (const configured of provided) {
    const record = records.creatives.find((creative) => normalize(creative.name) === normalize(configured.name));
    assert.ok(record, `Missing creative: ${configured.alias}`);
    const result = await fetch(`${base}/api/registry`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ ...record, kind: "creatives", designerId: configured.designerId }) });
    const body = await result.json();
    assert.equal(result.status, 200, body.error);
  }
  const saved = await (await fetch(`${base}/api/registry`)).json();
  for (const configured of provided) assert.equal(saved.creatives.find((creative) => normalize(creative.name) === normalize(configured.name))?.designerId, configured.designerId);
  console.log(`Saved and verified ${provided.length} provided designer IDs, including Faisal 2191.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
