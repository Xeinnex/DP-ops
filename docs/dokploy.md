# DP-Ops on Dokploy

Use a Dokploy **Application** with a **Dockerfile** build. SQLite runs inside the application: no PostgreSQL service, Prisma generation, or migrations command is needed. Database schema upgrades run automatically when the database opens.

## Source and build

- Repository: `Xeinnex/DP-ops`
- Branch: `docker-deployment-test`
- Build path/context: repository root (`/` in Dokploy)
- Dockerfile: `Dockerfile`
- Replicas: **1**, on a single server with local persistent storage
- Use a stop-first update policy to avoid overlapping writers during deployments.

The image builds dependencies for Linux using Node 22 on Debian, including SQLite native build tools. It starts production Next.js on **5087** and binds to `0.0.0.0`. The build needs internet access, including Google Fonts. Do not replace the start command with `next dev`.

## Runtime environment

Set these in the application's Environment tab, not build arguments:

```text
DP_DB_PATH=/app/data/dp-ops.sqlite
DP_COOKIE=<actual full Cookie header>
APP_ORIGIN=https://your-dp-ops-domain.example
```

`APP_ORIGIN` must match the exact browser-facing origin (scheme, hostname, and any non-default port). It lets API mutations work when Dokploy forwards HTTPS requests to the HTTP container. Foreign browser origins remain rejected. For an HTTP test domain use its HTTP origin instead.

Paste the actual cookie, preserving literal `$` characters; do not paste Markdown escapes. Keep it private and server-side. Update the environment and restart/redeploy when the cookie expires. `.env.local` is deliberately excluded from the Docker build.

## Persistent storage

Under Advanced/Volumes, create a named volume `dp-ops-data` mounted at `/app/data`. Ensure it is writable by the container's `node` user (UID/GID 1000). Mount the directory, not just the database file: SQLite WAL and SHM files belong beside it.

An empty volume starts a fresh seeded database. Local history is not uploaded through Git. To move it, stop local writes, make a consistent SQLite backup (SQLite backup API or a cleanly closed database), and transfer that backup to the server volume as `dp-ops.sqlite` before starting the server application. Preserve ownership. Never copy a live database file alone while WAL writes are active. Local and hosted databases remain separate afterwards.

Back up the volume using a SQLite-consistent backup procedure. Do not delete the volume during redeployment.

## Domain and ports

Add your domain with path `/`, container port **5087**, and HTTPS/Let's Encrypt where available. DNS must point to your server.

Leave Advanced host-port publishing empty. Dokploy's proxy routes to each container, so other applications can even use the same internal port without a host-port conflict. `EXPOSE 5087` documents the port; it does not reserve a host port.

The old Compose configuration published `5000:5000` and `5432:5432`, reserving both ports on the host. That explains a possible conflict, but the exact historical cause cannot be determined from the files alone.

Authentication is intentionally absent for this test. An unlisted domain is still reachable; anyone who can reach it can read and modify application data.

## Deploy and verify

1. Commit and push this branch before selecting it in Dokploy.
2. Save environment, volume, and domain settings, then Deploy.
3. Check build and runtime logs. If SQLite reports permissions errors, correct volume ownership.
4. Open `/dashboard`, check profiles, and refresh queues. The server's network/session access must be verified independently of local scraping.
5. Edit a record or daily ticket, restart, and confirm it persists.
6. Redeploy and confirm persistence again. Check API edits do not return origin-related 403 errors.

## Optional local Docker test

With Docker running, use the helper to load your local Next.js environment privately (including `DP_COOKIE` from `.env.local`):

```bash
node scripts/docker-local.cjs up --build -d
node scripts/docker-local.cjs logs -f app
```

Open `http://localhost:5087`. Compose publishes only on loopback and uses its own named volume, separate from your current local database. Plain `docker compose` does not load `.env.local` automatically; the helper does. `node scripts/docker-local.cjs down` preserves the volume; adding `-v` deletes its data. Restart after editing the cookie with `node scripts/docker-local.cjs up -d --force-recreate`.

Dokploy Application deployment uses the Dockerfile directly, not this local Compose port mapping.
