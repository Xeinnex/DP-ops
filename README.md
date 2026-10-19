# DP-Ops

For Docker and Dokploy deployment (Node 22, port 5087, persistent SQLite), see [the deployment guide](docs/dokploy.md).

Local Next.js creative operations workspace with SQLite daily history.

```bash
npm install
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000 for the dashboard. Keep the application bound to localhost; external authentication and deployment are not configured.

## Queues and persistence

- `/tickets`: client tickets grouped by client, with DT subtotals and badges for assignments outside the configured team.
- `/creative-tickets`: creative tickets grouped by alias. Team 04 ID 347 is the default; change the Team ID to inspect other teams.
- `/clients`: editable Clients DB, including company ID, name, daily DT and PC subscription.
- `/creatives`: editable Creatives DB, including website name, alias, scopes and daily bandwidth.
- `/dashboard`: date-selectable daily dashboard; also available at `/`.
- `/ticket-log`: immutable raw fetch history, filterable by day and ticket ID, with full JSON and timestamps.

SQLite lives in ignored `data/dp-ops.sqlite`. `DP_DB_PATH` can override the location. The client and creative constants are first-run seeds only; deleting or editing records in the site persists and does not reseed on restart. All supplied subscription hours and PC labels are seeded. Default creative capacity is 405 minutes (6:45), with the supplied scopes.

Ticket tabs automatically load today's saved queue. Only **Fetch/Refresh tickets** or the dashboard's **Refresh both queues** contacts the source website. The dashboard refreshes clients and then Team 347 sequentially; if one fails, already saved results remain and the error identifies the failed source. Refresh is available for today only. The scraper must still read every page to discover updated assignments/DT/statuses; there is no incremental endpoint available. Saving deduplicates IDs within each source/team/day and records each successful fetch. A failed scrape leaves the previous saved queue intact.

Tickets are retained for the entire day even when absent from later queues. Absence alone never changes status to Customer Review; delivery updates when observed or manually completed. DT locks when In Progress is first observed or delivery is recorded. Later platform unassignment preserves the worked entry?s creative and DT, and queue departure does not turn locked work into a reference. Edit DT, delete, and No BW remain available for manual corrections. A revision keeps the earlier work locked and starts a separate entry. Explicit reassignment updates the current owner; existing saved work-attribution records remain preserved. Daily work is not carried automatically into the next day.

Days use `America/Bogota`. Yesterday's ticket is saved again when fetched today. There is no automatic scraping at midnight and no carryover presented as today's activity. Historical days can be inspected on the dashboard. A fetch is attributed to the day on which it starts.

The dashboard combines today's saved client queue and Team 347 queue. Overlapping observations update one work entry, while eligible Open (Revision) transitions start additional numbered entries without replacing earlier work. Other inspected teams stay isolated from this dashboard. DT is an estimate, not measured work time. Missing/Not Set DT counts as 0:00. Outside-team assignments count toward client totals and remain visible with an **Other team** badge.

## Status tracking

The blue bar shows assigned DT against daily capacity; green overlays the status-weighted completed DT. Creative order is GD, GD+PD, GD+PD+FIG, CI, MG, VE. Client rows are blue when assigned DT meets the daily allowance, green when completed DT meets it, and yellow when tickets have no assigned DT. Clients with no tickets have dim gray text. Completion takes priority over utilization for row color.

- Draft and Inactive are excluded from work entries (raw fetches remain available in the log).
- Open and Assigned start at 0%; In Progress, including paused, is 50%; Quality Review is 80%.
- Customer Review, Closed and Archived are 100%.
- Incomplete/WIP first seen that day starts at 0%. After observed In Progress, a return to WIP completes and freezes that entry until tomorrow. Subsequent queue observations stay in the raw log but cannot create duplicate work or alter its DT. Cancellation can still exclude its DT.
- Open (Revision) after eligible work creates a new daily entry. Repeated observations of the same revision do not duplicate it. A revision after In Progress or Quality Review completes the earlier entry and flags it for verification; the new entry starts at 0%.
- Other transitions after In Progress infer 100% and are flagged for manual review. Explicit rules above take priority, including Quality Review at 80%.
- Customer Clarification has zero counted DT and a separate dashboard box. Canceled/Cancelled stays visible and flagged with zero counted DT.
- **Mark complete** persists a manual 100% override and locks DT for one daily entry, also locking completed WIP for the day. The button is hidden for delivered entries. **Edit DT** remains available for corrections. Creative ticket cards show the client name, ticket number, and simplified status; they are sorted Assigned, In Progress, Delivered. Clients absent from Clients DB appear in purple. Mark worked and ticket completion percentages are no longer shown in these cards.

Dashboard refresh runs both queue fetches sequentially under a shared lock. Only after both succeed, previously saved tickets missing from both queues are eligible for a direct status read at `/admin/tickets/:id`. Only the status is updated; DT and assignment are preserved. Known completed/canceled statuses and locked WIP are skipped. Each missing ticket gets one attempt per day/absence episode, persisted in SQLite before the request; reappearing in a queue resets eligibility. Failed checks are also recorded and not automatically repeated. Ticket log shows these checks, raw history, revision entries and manual completion decisions. Daily rules are replayed from immutable observations, so existing saved fetches participate without destructive migration.

Client matching uses website company IDs when available, otherwise normalized names. Creative matching uses full website names with case, accents, whitespace and apostrophe normalization; aliases are display names. Removing clients excludes them from future client fetches, while historical snapshots remain. Removing creatives preserves ticket history and makes their assignments appear as outside-team work.

## Cookie and queue configuration

`DP_COOKIE` in ignored `.env.local` contains the exact Cookie header used by Apps Script, kept entirely on the server. Replace it when necessary and restart Next.js. Escape literal dollar signs as `\$` because Next.js expands environment values.

The client queue is constructed from the editable Clients DB. `DP_CLIENT_QUEUE_URL` is retained for standalone scraper callers; app client fetches always use the database registry. `DP_CREATIVE_QUEUE_URL` optionally supplies custom crew filters; the selected Team ID replaces its team filter. Generated crew filters use states 1–4, matching the provided Apps Script. All queues are restricted to `https://jar.designpickle.com/admin/tickets`.

## Checks

```bash
npm run lint
npm run build
node scripts/check-scraper.cjs
node scripts/check-database.cjs
node scripts/check-status.cjs
```

Database checks use an isolated temporary SQLite file. For live checks, start the production server on port 3100, then run `node scripts/check-local.cjs`. This fetches and saves the actual configured queues. `node scripts/debug-access.cjs` reports sanitized access diagnostics without cookie values or ticket content.

Back up SQLite while the app is stopped by copying `data/dp-ops.sqlite`. Do not commit database files or `.env.local`.

## Dashboard pictures, comparisons, and queue links

Add square WebP profile pictures to `public/profile-pictures` as `PP-Alias.webp`, for example `PP-Diana.webp` or `PP-Nacho.webp`. Use the exact display alias from Creatives DB. Missing pictures show a blue circle; refresh the browser after adding one.

A thinner **Previous** bar appears below the current bar when assigned/completed DT changed since the last queue refresh. Its saved values survive browser and application restarts and are kept separately for each Bogotá day. The first refresh has no comparison when there is no saved work yet.

Client names link to their active website queues on the dashboard, Client tickets, and Clients DB. Company IDs can be edited in Clients DB without changing the internal record identity. The fetcher uses the edited company IDs. Creative names link to individual queues when a Designer ID is entered in Creatives DB; The supplied designer IDs are Ailen `2812`, Diana `1516`, Edgar `5371`, Faisal `2191`, Haqqy `1238`, Juanes `8284`, Andrew `2052`, and Nacho `1520`. These defaults seed new databases; existing editable records are updated through the registry API, not overwritten at startup. Queue links open in a new tab.

Creative cards receive a subtle green tint when all assigned DT is completed, and a red tint when assigned DT exceeds daily capacity (normally `6:45`). Red takes priority for an overloaded, completed queue. Empty queues are not marked complete.

Expand a creative's queue to choose **Available**, **Half Day**, or **Away**. A thin ring around the profile picture shows the selection: green for Available, yellow for Half Day, and red for Away. Available uses the full-day bandwidth (default `6:45`), Half Day uses `3:45`, and Away uses `0:00`. Buttons save the choice in Creatives DB and it stays selected across reloads, restarts, and days until changed. Daily snapshots preserve past availability. An Away creative with assigned tickets receives a strong red tint. Zero-capacity bars never divide by zero.

Tailwind scans only `src` so SQLite and other runtime file changes cannot trigger style recompilation/reload loops. Verify this with `node scripts/check-style-sources.cjs`. Queue filters can be checked with `node scripts/check-queue-links.cjs`.

## DT corrections and manually adding missed work

Creative ticket cards use two compact rows: aligned ticket number, client, and DT above; controls and status below. **Mark Delivered / Undo Delivered** saves a local daily delivery override, including undoing automatically detected delivery. **No BW** excludes an entry from assigned/completed workload and progress while keeping it visible with its original DT; **Restore BW** includes it again. Both controls persist per day, entry, and assignee and do not change the work website.

**Tickets Outside My Team** lists daily entries assigned to creatives outside the editable team roster. Rows show the ticket link, client, assignee, assigned DT, and simplified status: Assigned (blue), In Progress (yellow), or Delivered (green). Quality Review maps to In Progress; Customer Review, completed WIP, Closed, and Archived map to Delivered. Clarification and canceled tickets are excluded from this box.

Changing the dropdown saves a local daily override in SQLite and updates completed DT (0%, 50%, or 100%) without altering the raw fetched status or the work website. **Reset** restores automatic status tracking. Overrides belong to the work entry and its assignee, so they do not follow a reassignment to another creative. Ticket Log shows the local override separately.

DT locks when an entry is observed In Progress (including paused). Further In Progress observations can update DT until the entry leaves that status; afterwards its last In Progress DT is preserved even if the source clears it. Incomplete (Revision) follows the same daily rules as Incomplete (WIP). Saved observations are replayed with these rules, recovering previously captured In Progress DT without rewriting raw history. A new Open (Revision) work cycle has its own DT.

Use **Edit DT** in a creative's expanded dashboard queue to correct a daily entry. These corrections persist in SQLite, take priority over future source values for that entry, and appear in Ticket Log under **Manual DT corrections**. Customer Clarification tickets appear only in the separate dashboard clarification box, not in creative dropdowns.

Use **Add missed ticket** in the dashboard for a ticket that was delivered before the queues were refreshed. Paste its Design Pickle ticket URL and click **Look up ticket**. The server uses `DP_COOKIE` to read the client, title, and current status. Select a team creative, enter DT in `H:MM` format, and adjust the status if needed, then click **Add to today**.

Each manual addition creates an independent work entry for the Bogotá calendar day when it is added, even if the ticket is already saved. Each entry keeps its own creative, DT, status, and controls; later queue fetches do not merge or overwrite it. Entries appear in the client and creative screens and count toward daily assigned/completed DT using the usual status rules. Customer Review, Closed, and Archived count as 100% complete. Manual additions appear in Ticket Log as **Manual ticket** observations. Tickets are not carried automatically into another day.

Reference-only creative cards show **Add again** instead of Edit DT and No BW. This restores a countable independent entry for that creative using the last saved DT and hides the old reference card. Clarification and other excluded statuses restart as Assigned. The website's current assignment and raw history stay unchanged. Later scrapes cannot undo this explicit restoration; the restored card has the regular DT and workload controls.

Run `node scripts/check-manual-ticket.cjs` for URL/detail-parser checks and `node scripts/check-database.cjs` for daily persistence, independent duplicates, reference restoration, later fetches, and restart checks. Add `--live` to the manual-ticket check to read one existing ticket detail using your local cookie without saving a ticket.

Client history is available from **Show history** in Clients DB, newest first, including separate daily and manual work entries. Raw logs and daily records older than two calendar months are removed on the first database access each Bogotá day. Client/creative settings remain; a compact client last-active date survives cleanup, displayed as **60+ days** when older than 60 days. Plain Incomplete observations with a named creative and positive DT count as historical activity without changing completion rules.
