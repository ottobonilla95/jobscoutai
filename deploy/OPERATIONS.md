# DigitalOcean worker operations

The web app and worker are separate deployments. A Vercel deployment does not update the DigitalOcean worker. Deploy compatible worker code whenever profile formats, database access, model settings, or search behavior change.

The worker was repaired on 11 November 2026 using source revision `9163668`. Release `d19ca4d` corrected regional LinkedIn link parsing. The active release, `1e7e717`, adds bounded source and AI retries plus explicit coverage reporting, and was verified against ten live London listings and simulated upstream failures. The previous installation rejected profiles with more than three locations, before creating a run, and had no AI credential configured.

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
