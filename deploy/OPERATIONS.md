# DigitalOcean worker operations

The web app and worker are separate deployments. A Vercel deployment does not update the DigitalOcean worker. Deploy compatible worker code whenever profile formats, database access, model settings, or search behavior change.

The active worker release is `b0cc64b`, deployed on 12 November 2026 with cleanup after search completion and bounded pending retention. The same day's `6dcc2c6` installed qualified-shortlist and model-output fixes. Earlier repairs on 11 November used `9163668` for the outdated profile/credential setup, `d19ca4d` for regional LinkedIn links, and `1e7e717` for bounded retries and coverage reporting. Prior releases remain available for rollback.

## Shortlist update — 12 November 2026

Deploy web and worker together for the shortlist update. Collected listings remain an internal evaluation queue; the main view and its count require a current qualifying assessment. Saving also checks qualification on the server. Existing manual saves and application history remain accessible separately. Profile corrections invalidate older assessments, so an empty shortlist is valid until jobs pass the current criteria.

Strict ranking output now requires nullable compensation instead of an optional property. Research generates plain URL strings and validates them before storing or following sources, avoiding the provider's unsupported `uri` format. Ranking allows up to 10,000 output tokens including reasoning; research allows 8,000. Account call/evaluation limits and run deadlines still apply.

## Search completion cleanup

Apply migration 010 before deploying the retention update to web and worker. `Store.upsert` consults account/profile-scoped identity hashes to avoid rebuilding discarded listings; `runSearch` calls `Store.cleanupJobs(version)` in its completion path, including partial/failed runs. Cleanup is transactional and skips obsolete profile versions. Failure is recorded on the run and still releases its lease. There is no separate cleanup service or timer.

Untouched current rejections, duplicates and closed listings lose their full job records and dependent job research/checkpoints. Qualified matches and promising research remain. Explicit saves/archives, tracking, feedback, research requests, duplicate reviews and delivery history are protected. Unprotected pending/reassessment records are capped at twice `maxJobsPerRun` and expire after 48 hours from first discovery. Overflow and expiry are retryable after 24 hours, not labelled failed fit. Compact IDs/hashes expire after 90 days; changed matching preferences permit reconsideration immediately.

Before applying this policy to an existing backlog, take a private snapshot of the account's jobs and dependent `research_tasks`, `opportunity_feedback` and `delivery_jobs` rows. Use a transaction rollback to preview `cleanupJobs` counts first. Preserve user history and do not force a paid search merely to run cleanup. A rollback to an earlier release may leave migration 010 installed harmlessly, but restores the earlier unbounded retention behavior.

## Installed layout

- `/opt/job-searcher/releases/<revision>` contains the source and production dependencies for a release.
- `/opt/job-searcher/current` points to the active release.
- `/opt/job-searcher/.env` contains the worker's private configuration, owned by `jobscout` with mode `600`. Release `.env` files link to it. Never commit or print its contents.
- `/opt/job-searcher/runtime` contains the dedicated Node runtime. Release `runtime` links point to it.
- `/etc/systemd/system/scout-worker.service.d/release.conf` sets `WorkingDirectory=/opt/job-searcher/current`; the generated base service still provides the user, executable, sandbox, and timeout.
- `scout-worker.timer` checks every 15 minutes. Search execution also enforces each account's interval and the shared AI budget.

## Updating

1. Stop `scout-worker.timer` and wait for any active or activating `scout-worker.service` to finish. Do not replace files used by a running scan.
2. Create a new release directory owned by `jobscout`. Copy the chosen revision's `apps/worker`, `packages/core`, `migrations`, `scripts`, `config`, `package.json`, `package-lock.json`, `tsconfig.json`, and `.env.example`. Keep the previous release for rollback.
3. Link the release's `.env` and `runtime` to `../../.env` and `../../runtime`. In the release directory, run `npm ci --omit=dev` as `jobscout`, using `/opt/job-searcher/runtime/bin` on `PATH`.
4. Run `runtime/bin/node --env-file=.env --import tsx scripts/migrate.ts` as `jobscout`. Ensure the worker and web use the same database and compatible model settings, AI credentials, and minimum search interval.
5. Atomically repoint `current` to the new release. Reload systemd if a unit or override changed, restart the timer, and start the service to process due accounts. An ordinary service start respects cooldowns; do not use `--force` for deployment validation.
6. Verify a recorded run, its result, and the timer's next trigger. A heartbeat alone does not prove a scan started or completed. If deployment fails, restore a compatible release/configuration and ensure the timer is running again.

## Checking a queued first search

```sh
readlink -f /opt/job-searcher/current
systemctl status scout-worker.timer scout-worker.service --no-pager
journalctl -u scout-worker.service -n 100 --no-pager
systemctl list-timers scout-worker.timer --no-pager
```

Check the saved profile against the deployed schema and verify `integrations().ai` without logging credentials. Validation can fail before the worker claims a run, leaving the request queued and the run history empty. An unconfigured email provider does not prevent searching; it only affects email delivery.

## Retry and coverage behavior

Source queries make up to three attempts for temporary network, server, throttling, or unreadable-response failures, with two- and four-second backoff and any longer `Retry-After` delay. Retries consume the shared 24-request run budget and per-source allowance, and stop at the run deadline. An excessive retry delay is deferred to a later run. Access challenges and explicit authorization blocks stop that source immediately.

Exhausting one query's retries leaves the remaining queries and locations eligible. History rotates unsearched queries ahead of previously attempted ones, while failed queries remain eligible for future scans. Successful results survive later failures. Activity records retries and distinguishes successful location queries, unavailable locations, and locations not searched before the run stopped; a successful query does not imply exhaustive coverage.

AI planning, evaluation, and research allow two provider retries for retryable errors within their existing timeouts. Persisted jobs and research checkpoints remain available when recovery cannot complete. Normal account cooldowns and AI generation budgets still apply; deployment validation must not force an extra scan.
