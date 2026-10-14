// Read Next.js env files without printing secrets or baking them into the image.
require("@next/env").loadEnvConfig(process.cwd());
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const result = spawnSync(process.platform === "win32" ? "docker.exe" : "docker", ["compose", ...args], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
