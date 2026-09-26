# Verification — 24 September 2026

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
