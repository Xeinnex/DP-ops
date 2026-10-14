const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const exportsObject = {};
const environment = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/request-origin.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, process: { env: environment }, URL });
const allowed = exportsObject.allowedRequestOrigin;
const request = (origin) => new Request("http://localhost:5087/api/availability", {
  headers: { host: "localhost:5087", ...(origin ? { origin } : {}) },
});
assert.equal(allowed(request("http://localhost:5087")), true);
assert.equal(allowed(request("https://unrelated.example")), false);
environment.APP_ORIGIN = "https://ops.example.com";
assert.equal(allowed(request("https://ops.example.com")), true);
assert.equal(allowed(request("http://ops.example.com")), false);
assert.equal(allowed(request("https://ops.example.com.evil.example")), false);
assert.equal(allowed(request()), true);
environment.APP_ORIGIN = "invalid";
assert.equal(allowed(request("https://ops.example.com")), false);
console.log("Origin checks passed: local, HTTPS proxy, foreign origin, invalid configuration.");
