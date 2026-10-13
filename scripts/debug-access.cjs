const { loadEnvConfig } = require("@next/env");
const fs = require("node:fs");
loadEnvConfig(process.cwd(), true);

async function main() {
  const cookie = process.env.DP_COOKIE?.trim();
  if (!cookie) throw new Error("DP_COOKIE is missing.");
  console.log("Cookie names:", cookie.split(";").map((part) => part.trim().split("=")[0]).join(", "));
  const url = new URL("https://jar.designpickle.com/admin/tickets");
  url.searchParams.set("q[company_id_eq]", "108848");
  url.searchParams.set("q[ticket_status]", "active");
  url.searchParams.set("page", "1");
  const combined = new URL("https://jar.designpickle.com/admin/tickets");
  const ids = [...fs.readFileSync("src/data/clients.ts", "utf8").matchAll(/id: "(\d+)"/g)].map((match) => match[1]);
  ids.forEach((id) => combined.searchParams.append("q[company_id_in][]", id));
  combined.searchParams.set("q[ticket_status]", "active");
  combined.searchParams.set("page", "1");
  for (const [scope, queueUrl] of [["single client", url], ["all clients", combined]]) {
  for (const userAgent of ["DP-Ops/0.2", "Mozilla/5.0"]) {
    const response = await fetch(queueUrl, { headers: { Cookie: cookie, Accept: "text/html", "User-Agent": userAgent }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const location = response.headers.get("location");
    console.log(JSON.stringify({ scope, userAgent, status: response.status, redirectPath: location ? new URL(location, queueUrl).pathname : null, server: response.headers.get("server"), ticketTable: /<tbody/i.test(html), loginForm: /type=["']password/i.test(html), challenge: /cf-chl|challenge-platform|just a moment/i.test(html) }));
  }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
