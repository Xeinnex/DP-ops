const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: id => dependencies[id] || require(id), Map, Set });
  return exports;
}
const daily = load("src/lib/daily.ts");
const status = load("src/lib/ticket-status.ts", { "@/lib/design-time": load("src/lib/design-time.ts") });
const { waitingAssignments } = load("src/lib/waiting-assignments.ts", { "@/lib/daily": daily, "@/lib/ticket-status": status });
const client = { id: "10", name: "Example", pc: "NO PC", dailyMinutes: 120 };
const ticket = { id: "1", clientId: "10", client: "Example", assignee: "Not assigned", status: "Open", designTime: null, position: 2 };
let rows = waitingAssignments([client], [ticket, { ...ticket, id: "2", position: 1 }]);
assert.equal(rows.length, 1);
assert.equal(rows[0].tickets.length, 1);
assert.equal(rows[0].tickets[0].id, "2", "No assignments: show the first platform queue ticket");
const owner = { ...ticket, id: "3", assignee: "Ailen", designTime: "0:00", status: "Assigned" };
assert.equal(waitingAssignments([client], [ticket, owner]).length, 0, "Zero DT with a named creative is still assigned");
for (const pc of ["PC", "PC AD"]) {
  rows = waitingAssignments([{ ...client, pc }], [ticket, { ...ticket, id: "2" }, owner]);
  assert.equal(rows[0].tickets.length, 2, "PC accounts show all waiting tickets even with other work assigned");
}
assert.equal(waitingAssignments([client], [ticket, { ...owner, status: "Customer Review", completion: 1 }]).length, 0, "Delivered work still counts as an assignment today");
assert.equal(waitingAssignments([client], [{ ...ticket, retained: true }]).length, 0);
assert.equal(waitingAssignments([client], [{ ...ticket, independentManual: true }]).length, 0);
for (const state of ["Customer Clarification", "Canceled", "Draft", "Inactive", "Closed", "Archived", "Customer Review"]) assert.equal(waitingAssignments([{ ...client, pc: "PC" }], [{ ...ticket, status: state }]).length, 0);
assert.equal(waitingAssignments([{ ...client, pc: "PC" }], [ticket, ticket])[0].tickets.length, 1, "Queue tickets are not listed twice");
console.log("Waiting-assignment checks passed: first queued ticket, assignment versus DT, PC/PC AD inclusion, delivery, exclusions and duplicates.");
