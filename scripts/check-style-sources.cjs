const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const sourceDirectory = path.resolve("src");
  const filename = path.resolve("src/app/globals.css");
  const compiler = await require("@tailwindcss/node").compile(fs.readFileSync(filename, "utf8"), { from: filename, base: path.dirname(filename), onDependency() {} });
  assert.ok(compiler.root && compiler.root !== "none");
  assert.equal(path.resolve(compiler.root.base, compiler.root.pattern), sourceDirectory);
  const scanner = new (require("@tailwindcss/oxide").Scanner)({ sources: [{ ...compiler.root, negated: false }, ...compiler.sources] });
  const candidates = scanner.scan();
  assert.ok(candidates.includes("text-[#505050]"), "Dashboard styles must still be discovered.");
  assert.ok(scanner.files.every((file) => path.resolve(file).startsWith(sourceDirectory + path.sep)), "Runtime files must not be watched as style sources.");
  assert.ok(scanner.globs.every((glob) => path.resolve(glob.base) === sourceDirectory || path.resolve(glob.base).startsWith(sourceDirectory + path.sep)), "Style directory watches must stay within src.");
  console.log("Tailwind source checks passed: app styles discovered; SQLite, environment, and build directories excluded from style watches.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
