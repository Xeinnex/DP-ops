# DP-Ops

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

Tickets are retained for the entire day even when absent from later queues. They are labelled as retained daily work, keeping their last observed DT and owner. Absence alone never changes status to Customer Review; that status updates when actually observed in a fetched source. The newest observed DT and assignee override older observations, including overlapping sources. Reassigned tickets move to the new owner unless the original owner explicitly marked the ticket worked on the dashboard. **Mark worked** preserves the estimate at marking time if the ticket is subsequently reassigned; **Worked · undo** removes this lock. If the owner stays the same, newer DT values still update their workload. These estimates are not measured work time, and both owners can have contributions when prior work was explicitly marked. This daily safelock does not carry yesterday's work into today automatically.

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
- **Mark complete** persists a manual 100% override for one daily entry. This also locks WIP for the day when an In Progress observation was missed. **Undo completion** removes the override. This control is distinct from **Mark worked**, which preserves attribution across reassignment.

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

## Manually adding missed work

Use **Add missed ticket** in the dashboard for a ticket that was delivered before the queues were refreshed. Paste its Design Pickle ticket URL and click **Look up ticket**. The server uses `DP_COOKIE` to read the client, title, and current status. Select a team creative, enter DT in `H:MM` format, and adjust the status if needed, then click **Add to today**.

The entry is saved in SQLite for the Bogotá calendar day when it is added, appears in the client and creative ticket screens, and counts toward daily assigned/completed DT using the usual status rules. Customer Review, Closed, and Archived count as 100% complete. Manual additions appear in Ticket Log as **Manual ticket** observations. Adding an already-saved daily ticket is rejected to avoid double counting; a later queue fetch updates the existing entry normally. Tickets are not carried automatically into another day.

Run `node scripts/check-manual-ticket.cjs` for URL/detail-parser checks and `node scripts/check-database.cjs` for daily persistence, duplicate protection, later fetches, and restart checks. Add `--live` to the manual-ticket check to read one existing ticket detail using your local cookie without saving a ticket.
