# Verification log

## 12 November 2026 — cleanup after every search

- Search completion now transactionally removes untouched rejected, closed and duplicate listings and their dependent job research/checkpoints. It also bounds unassessed/reassessment records to twice the per-search evaluation allowance with a 48-hour first-discovery expiry. Overflow/expiry remains retryable rather than being labelled a fit rejection.
- Account/profile-scoped compact identity hashes suppress immediate recollection; changed matching preferences allow reconsideration. Score-threshold edits now invalidate prior assessments too. Saved/archived jobs, tracking, feedback, explicit research requests, duplicate reviews and delivery history are protected; stale-profile cleanup skips deletion.
- All 199 automated tests passed with concurrency limited to two. Coverage includes cleanup on successful/partial/failed runs, provider failure backlog limits, identity deduplication, anonymous-employer handling, expiry, profile changes, account isolation, protected history, transactional rollback and cleanup-error lease release. TypeScript checks and the production build passed.
- Production rollout and initial backlog cleanup are pending.

## 12 November 2026 — qualified shortlist and model-output repairs

- The main view now shows only current assessed matches meeting the account's minimum score and active sources. Promising assessed research is separate; raw, weak, excluded, closed, duplicate and stale results do not inflate either count. Manual saves and application history remain accessible after profile changes.
- Server-side saves reject unassessed, weak and stale jobs. Regression tests cover a 377-record discovery backlog yielding one qualified match, English/Spanish rendered counts, research eligibility, and save validation.
- Reproduced provider rejection of optional compensation in ranking output and unsupported `uri` format in research output. Ranking now requires nullable compensation; research validates URL strings after generation. Expanded output limits accommodate reasoning and structured results.
- A live ranking request completed successfully after the schema repair, returning a 56/100 research decision rather than promoting the role. A separate synthetic live research request passed the corrected schema. Neither probe changed job assessments or bypassed search cooldowns.
- All 189 tests passed before adding two provider-contract regressions; those additional tests also passed. TypeScript checks and the production web build passed.
- Deployed source `6dcc2c6` to Vercel production and DigitalOcean. Verified the authenticated production UI shows **Para ti**, **Por verificar**, and **Guardadas**, with zero current qualified results instead of displaying 377 discovery records. The corrected account profile invalidates prior scores for reassessment; its next eligible search remains scheduled for 14:00 UTC on 12 November. Worker activation checked both output schemas without paid requests, retained the previous release, and restored the timer.

## 11 November 2026 — bounded retries and explicit coverage

- Source queries now retry temporary failures up to three total attempts with backoff, honoring `Retry-After`, the run deadline, and physical-request budgets. Unreadable query responses no longer disable later locations; authorization challenges still stop the affected source.
- Query history prioritizes previously unsearched queries without treating failed historical queries as completed. Activity shows retries and distinguishes successful location queries, unavailable locations, and locations not searched. Older reports remain compatible.
- AI planning, ranking, and research enable two provider retries within existing operation timeouts. Persisted jobs and research checkpoints retain their existing recovery behavior.
- All 172 automated tests passed with concurrency limited to two, including retry exhaustion/recovery, rate-limit delays, deadlines, request accounting, Colombia-to-London continuation, historical failure rotation, coverage rendering, legacy reports, and AI planner recovery after two temporary errors. TypeScript checks and the production web build passed.
- Deployed worker release `1e7e717` on DigitalOcean using the unchanged production dependencies. A simulated upstream check on the staged worker recovered Colombia after two HTTP 503 responses, exhausted an unreadable Berlin query, and continued to Stockholm; eight physical requests were recorded with accurate coverage. A separate live London probe returned HTTP 200 and ten parsed jobs. The release also verified that explicit LinkedIn HTTP 999 access blocks are not retried as server errors. No paid scan or cooldown bypass was used for these checks.
- After activation, the normal service tick exited successfully as idle at 18:44:27 UTC, respecting cooldowns. The timer remains active and enabled, with its next tick at 18:59:27 UTC.

## 11 November 2026 — LinkedIn regional-domain parser repair

- Live probes from the droplet returned HTTP 200 and ten job cards for both Colombia and London. Their job links used `co.linkedin.com` and `uk.linkedin.com`; the old parser rejected both hosts, parsed zero jobs, and incorrectly stopped LinkedIn for the rest of the scan.
- Revision `d19ca4d` accepts bare, www, and two-letter regional LinkedIn hosts, canonicalizes accepted job links to `www.linkedin.com`, and rejects lookalike hosts, non-HTTPS links, credentials, and custom ports.
- All 165 tests passed with test concurrency limited to two, including a Colombia-to-Europe continuation regression. The unrestricted run encountered a native V8/WebAssembly crash in a database fixture; the bounded rerun and TypeScript checks passed.
- Deployed the revision as a new DigitalOcean release with the unchanged production dependency lock. Verified the patched live London query parsed ten jobs, then activated the release and restored the enabled timer. The probe did not create a paid scan or bypass the account cooldown.

## 11 November 2026 — live DigitalOcean worker recovery

- Confirmed the enabled systemd timer was invoking an outdated worker. Its profile schema rejected the completed account's ten search locations against an old maximum of three, before claiming a run. The worker also had no AI credential configured.
- Installed source revision `9163668` with production dependencies in `/opt/job-searcher/releases/9163668`, configured the shared private AI connection, and verified migrations were current. The systemd service uses the `current` release symlink through a working-directory override; the previous installation is retained.
- Verified both stored profiles parse successfully with the deployed code. Restarted the normal service without forcing or bypassing cooldowns.
- The first queued search ran from 13:38:06 to 13:42:10 UTC: 14 jobs discovered, 5 evaluated, 0 strong matches. The queue cleared and systemd exited successfully.
- The run is recorded as **partial**: LinkedIn and ElEmpleo returned unreadable search pages, Michael Page returned HTTP 403, and some planning, ranking, and research steps failed. Five completed ranking generations confirm the live AI connection; this does not verify every AI workflow or guarantee complete source coverage.
- Confirmed the timer remains active and enabled, with the next account search window at 17:38 UTC. Email delivery was not tested or configured by this recovery.
- Worker deployment and rollback considerations are documented in [worker operations](deploy/OPERATIONS.md). Vercel deployments do not update the worker.

## 24 September 2026 — historical local verification

Completed locally:

- Production Next.js build and standalone server.
- TypeScript checks and all 46 automated tests: source parsing, evidence validation, database locking, scheduling, expired-run recovery, preference reevaluation, email idempotency, retry expiry, the search pipeline, access throttling, password hashing, account isolation, session revocation/expiry, dispatch across accounts, and localization.
- Production browser checks of email/password signup, onboarding, profile saving, logout, sign-in restoring the saved profile, and mobile layout. No browser errors were reported.
- API checks of unauthenticated access, origin protection, weak passwords, duplicate signup, incorrect credentials, normalized email login, private profile/job persistence, cross-account read/update denial, session revocation, and the missing-model-key guard.
- Backup check with two temporary accounts: the snapshot includes the account registry and both private account databases.
- TXT upload in development and PDF/DOCX uploads through the standalone production API. PDF.js's dynamically loaded worker is explicitly included in the deployment trace.
- Live public LinkedIn HTTP check: 9 listings returned; one description retrieved (3,115 characters). No browser, login, or cookies used by the connector. This demonstrates current access, not guaranteed future availability.
- Docker Compose configuration validation.
- Source-selection save/reload in the production browser; source defaults and validation, exact company-board host validation, YC and company-feed parsing, shared evaluation budget, disabled-source exclusion, and continuing after one source fails, and suppressing notifications from disabled sources.
- Live YC discovery with the current target titles: 2 matching listings and one 3,443-character description. Live Ashby (Wispr Flow) and Greenhouse (Figma) checks with an Engineer keyword: 17 and 31 roles respectively. These were connector checks, not additions to the saved company watchlist.

Automated pipeline tests inject model and email responses; they do not prove live provider connectivity. The application uses real providers and reports missing configuration explicitly.

Not yet verified or performed:

- Live AI evaluation and email delivery: credentials and verified sender are not configured.
- Docker image build/run: local Docker daemon is stopped.
- DigitalOcean deployment, DNS, HTTPS issuance, and Linux timer execution: server access and domain are not supplied.

Temporary profile changes were removed. No sample job listings or test CV remain in the application's database. Scheduled searches and email notifications remain disabled until configured.


Strategy and tracker update (24 September):

- Grouped weighting, score caps, unsupported/duplicate evidence, hard gates, different sponsorship policies by country, alternative locations, and unknown location handling tested.
- Legacy strategy defaults, score invalidation, duplicate review override, date windows, and daily per-account/global AI budgets tested.
- Application-route tests cover reachable forms, closed listings, challenges, newsletter forms, redirects, and private/link-local address rejection. These use fixtures; no claim of universal live-site compatibility.
- Verification/reset tokens tested for purpose binding, expiry, single use, email verification, password changes, and session revocation.
- Production API checks with two disposable accounts: strategy isolation, private research leads, private job tracking, foreign-link-check denial, verified-only notification recipients, reset revocation, and missing-provider guards.
- Browser country-rule save/reload and research-lead creation verified at mobile width.
- Live safe-HTTP client reached nodejs.org with HTTP 200; a Node dual-stack DNS callback issue found during this check was fixed and covered by a regression test.
- The configured model ID remains in the live public AI Gateway catalog. Model outputs, Markdown extraction quality, recovery/verification email delivery, and real match notifications still require configured provider credentials and live checks.

English/Spanish update (24 September):

- Production build, TypeScript checks, and all 46 tests passed. Localization tests cover regional browser preferences, quality weights, fallback, dictionary/interpolation completeness, view translation coverage, date/number formatting, per-account preference persistence, original-content preservation, localized email payloads, and AI language instructions.
- Production browser checks: Spanish signup from `es-MX` browser preferences, Spanish onboarding defaults, Settings language switching, explicit English persisting after reload with a Spanish browser, and switching back to Automatic. The 390-pixel-wide Spanish settings view has no horizontal overflow. No browser errors were reported.
- Production API checks with disposable accounts: anonymous cookie override, account preference taking priority across sessions/cookies, account isolation, Spanish signup defaults, last-browser language stored for the worker, localized validation/authentication errors, and rejected foreign origins. Test accounts were removed afterward.
- Email payloads use injected delivery and AI checks inspect language instructions. No live Spanish model generation or email delivery is claimed without configured providers.

Product configuration update (26 September):

- JobScout AI branding comes from `config/product.json`, shared by frontend and worker. Translated copy interpolates the product name. Cookie and deployment identities are centralized but retain their existing values for compatibility.
- TypeScript checks, all 46 tests, and the production build passed. An isolated configuration change verified propagation into package/lockfile metadata, Compose, systemd units, and documentation; check mode correctly rejected stale generated output.
- Production browser checks covered English signup, Spanish dashboard copy and page title, a 390-pixel mobile layout without horizontal overflow, and the desktop sidebar. No browser errors or unresolved brand placeholders were reported. The disposable account was removed.
- A standalone worker idle tick loaded the shared configuration successfully. Docker Compose configuration and timer-installer shell syntax validated. No deployment or live notification delivery was performed.
