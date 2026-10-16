const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/client-lookup.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, require, URL });
const queue = "https://jar.designpickle.com/admin/tickets?q%5Bcompany_id_eq%5D=19604&q%5Bticket_status%5D=active";
assert.equal(api.companyIdFromQueue(queue), "19604");
assert.throws(() => api.companyIdFromQueue(queue.replace("jar.designpickle.com", "example.com")));
assert.throws(() => api.companyIdFromQueue(queue + "&q[company_id_in][]=123"));
assert.equal(api.clientNameFromQueue('<select name="q[company_id_eq]"><option value="19604" selected>AssetWorks Inc.</option></select><tbody></tbody>', "19604"), "AssetWorks Inc.");
assert.equal(api.clientNameFromQueue('<a href="/admin/companies/19604">AssetWorks Inc.</a>', "19604"), "AssetWorks Inc.");
assert.equal(api.clientNameFromQueue('<a href="/admin/companies?company_id=19604">AssetWorks Inc.</a><tbody></tbody>', "19604"), "AssetWorks Inc.");
assert.throws(() => api.clientNameFromQueue('<input type="password">', "19604"));
console.log("Client lookup checks passed: URL validation, empty queue selection, company link, expired session.");
if (process.argv.includes("--live")) {
  require("@next/env").loadEnvConfig(process.cwd());
  fetch(queue, { headers: { Cookie: process.env.DP_COOKIE, Accept: "text/html", "User-Agent": "Mozilla/5.0" }, redirect: "manual", signal: AbortSignal.timeout(30000) }).then(async (response) => {
    assert.equal(response.status, 200, "Live queue lookup must accept the configured session");
    const name = api.clientNameFromQueue(await response.text(), "19604");
    assert.ok(name, "Live queue must include its company name");
    console.log("Live read-only lookup:", name, "19604");
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
