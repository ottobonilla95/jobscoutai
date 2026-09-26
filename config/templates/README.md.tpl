# {{name}}

An account-based job-search app and scheduled worker. Next.js provides the dashboard; the TypeScript worker searches your selected job sources, evaluates new results against your CV, and optionally emails matches. Accounts and sessions live in a shared SQLite database; each account has a separate SQLite database for its private search data. Both services share persistent storage.

## Product configuration

Edit `config/product.json` to change the product name, package/image slug, or HTTP user agent. The frontend and worker both import `packages/core/src/brand.ts`; translated copy interpolates `{productName}` instead of hardcoding a name.

After editing the configuration, run `npm run brand:sync`. It updates package metadata/lockfile, Docker Compose, systemd units, the timer installer, and this README from `config/templates`. Edit templates for changes to generated files. `npm run brand:check` detects stale generated output and runs before builds and tests. Rebuild and restart the web app and worker to apply a branding change.

The `compatibility` settings deliberately preserve existing cookie names, the Compose project/volume, timer identifiers, and install path. These are storage/session identities, not display branding. Changing them requires a separate migration. Existing `.env` paths, database records, and queued email payloads are preserved. Set `EMAIL_FROM` to a verified address with your desired sender display name; branding configuration does not rewrite provider credentials.

## Projects

- `apps/web`: Next.js dashboard, email/password signup and sign-in, CV import, preferences, results, and run history.
- `apps/worker`: a short-lived scheduler/worker process.
- `packages/core`: LinkedIn, Y Combinator, Ashby, and Greenhouse retrieval, model scoring, storage, and notification delivery.
- `deploy`: DigitalOcean Docker Compose, HTTPS proxy, systemd search/backup timers.

Requires Node.js 24+. The SQLite API currently prints Node's experimental warning; data lives in a regular SQLite database.

## Local setup

```bash
npm ci
npm run setup
```

Open `.env` locally. Add these platform credentials once; users do not need their own model key:

| Variable | Purpose |
| --- | --- |
| `AI_GATEWAY_API_KEY` | AI Gateway key for real CV-based evaluation; works on DigitalOcean without Vercel hosting. |
| `AI_MODEL` | Defaults to `openai/gpt-6-luna`, verified in the model catalog at implementation time. |
| `AI_REASONING_EFFORT` | Defaults to `medium`. Keep an OpenAI reasoning model when using this provider option. |
| `RESEND_API_KEY` | Needed only for email notifications. |
| `EMAIL_FROM` | A sender verified in your Resend account, e.g. `{{name}} <jobs@your-domain.com>`. |
| `APP_URL` | Exact browser origin; locally `http://localhost:3000`. Used for origin validation and email links. |
| `DATA_DIR` | Absolute directory shared by both processes; setup fills this automatically. |

Start the website and local worker scheduler in separate terminals:

```bash
npm run dev
npm run worker:watch
```

Open `http://localhost:3000/signup`, create an account with email and password, and complete Search profile. Sign in at `/login` on subsequent visits. Upload a text-based PDF, DOCX, or TXT CV, or paste the text. Review the extracted text before saving. Only extracted text is stored; the original uploaded file is not retained. Scanned PDFs need OCR elsewhere.

Searches and emails start disabled. Configure your profile, then enable them or use Search now. A queued manual search is picked up on the worker's next check, even while automatic searches are paused. Missing credentials produce explicit errors; there are no fabricated matches or simulated provider responses in the app.

Other commands:

```bash
npm run worker:once -- --user <account-id>  # Run one account immediately
npm run worker        # Check whether a search is due, then exit
npm run typecheck
npm test
npm run build
npm start
npm run backup
npm run check:ai       # Small paid API check using synthetic data
```

## DigitalOcean deployment

Use one Ubuntu Droplet with Docker Engine and the Docker Compose plugin installed. A 2 GB machine is a reasonable starting point; local Next.js builds can need more memory, so build the container elsewhere if necessary. The app and search worker run as a non-root container user. Caddy is the only public entry point, with HTTPS.

1. Put this project at `{{installDirectory}}` on the server. Transfer source and lockfile, not local `node_modules`, `.next`, or test data.
2. Create a fresh `.env` on the server using `node scripts/setup.mjs` (requires Node 24 on the host), or copy `.env.example` and fill in the service settings. Signup creates account credentials; there is no shared application password. Keep `.env` mode `600`.
3. Set `APP_DOMAIN=jobs.your-domain.com` and `APP_URL=https://jobs.your-domain.com`; point the domain's DNS to the Droplet. Add the AI and optional email credentials.
4. Allow inbound TCP 80/443 and your SSH access in the DigitalOcean firewall. Port 3000 is bound only to loopback.
5. From `{{installDirectory}}`, run:

```bash
docker compose build
docker compose up -d web caddy
sudo bash deploy/install-timers.sh
```

The initial container sets the data volume's ownership. Web and worker share the `{{dataVolume}}` volume. Compose overrides `DATA_DIR` to `/app/data` inside the containers. Do not use `docker compose down -v` unless you intend to erase your data.

The worker timer checks every minute and runs at most one due account per invocation, rotating across accounts. Searches may start later than their due time when other accounts are being processed. The database stores when a real search is due, so 1-, 2-, 3-, or 23-hour intervals all work. This is not a 23-hour cron expression. Each run exits when finished. The manual button queues work instead of holding an HTTP request open.

Operational commands:

```bash
docker compose logs --tail 100 web
journalctl -u {{servicePrefix}}-worker.service -n 100
systemctl list-timers {{servicePrefix}}-worker.timer {{servicePrefix}}-backup.timer
docker compose --profile worker run --rm worker node --import tsx apps/worker/src/index.ts --force --user <account-id>
```

Updates: copy the updated source, run `docker compose build`, then `docker compose up -d web caddy`. The worker uses the rebuilt image on its next invocation. Stop the worker timer and wait for an active worker service to finish before incompatible code/database changes.

The daily backup timer creates consistent snapshots of `accounts.sqlite` and every account database under a timestamped backup directory. It also preserves the old prototype database when present. Copy these backups off the Droplet or enable Droplet backups. Apply a retention policy. To restore, stop web and worker services, restore `accounts.sqlite` and the matching `users/<account-id>/jobs.sqlite` paths, remove stale WAL/SHM files, then restart. These contain private profile data and credential hashes.

## Accounts and AI configuration

- Signup requires a valid email format and a 12–128-character password. Passwords use salted scrypt hashes. Sessions use random, opaque cookies; only their hashes are stored. Logout revokes the server-side session. Old shared-password cookies are not accepted.
- Every data route derives account identity from the session. A client cannot select another account with a URL or request field. Accounts are stored in `DATA_DIR/accounts.sqlite`; private data is in `DATA_DIR/users/<account-id>/jobs.sqlite`.
- Login and signup have persistent attempt limits. Manual searches have a five-minute cooldown per account. Set `ALLOW_SIGNUP=false` to close new registrations while preserving existing logins.
- New users get neutral career goals and LinkedIn selected. Your founder goals belong in your own search profile.
- Email verification and self-service password recovery are available through the configured email provider. Verification links expire after 24 hours; reset links after 30 minutes. Tokens are hashed, purpose-bound, and single-use. Password reset revokes all sessions. Job notifications require a verified account address. Configure delivery and verify the complete email flows before a public launch.
- Existing prototype data at `DATA_DIR/jobs.sqlite` is retained and backed up, but is never automatically assigned to the first signup. It needs an explicit owner migration if you want to reuse it. `APP_PASSWORD` and `SESSION_SECRET` in an old `.env` are now ignored.
- Add `AI_GATEWAY_API_KEY` in the server `.env`, then restart web/worker services. The existing AI SDK connector uses `AI_MODEL` (default `openai/gpt-6-luna`) and `AI_REASONING_EFFORT=medium`. This is an API credential, separate from a ChatGPT subscription. The key is never returned to the browser or stored in a user profile.
- `npm run check:ai` tests the configured model with synthetic candidate/job text and reports token usage. It performs a real billable model call. No model connection is claimed until this succeeds. Set provider spending limits before opening the service to many users.

## Languages

The interface supports English and Spanish through a shared translation dictionary in `packages/core/src/i18n`. On first visit, the browser's `Accept-Language` preferences choose the best supported language, including regional variants such as `es-MX`. English is the fallback.

Login and signup have a small language control. Signed-in users can choose **Settings → Language → Automatic (browser), English, or Español**. An explicit account preference takes priority over the browser and follows the account across devices. Before login, a cookie remembers the choice. Automatic mode remembers the most recently detected browser language for background searches and emails.

Interface text, application errors, email templates, and date/number displays are localized. AI evaluation and strategy-import instructions request explanations in the selected language. Original job titles, quoted evidence, CVs, and personal notes are preserved. Changing language marks previous evaluations for reevaluation on a subsequent search; existing generated explanations keep their original language until then. New Spanish accounts receive translated default goal/rubric text. User-authored profile text is never rewritten by a language switch.

Translations are local dictionaries, without a translation service or additional model call. Live model output and email delivery still require configured credentials; automated tests verify the prompts and email payloads.

## Sources and research preferences

In **Search profile → Where to search**, select LinkedIn, Y Combinator, and/or company career pages. LinkedIn is the default for new accounts; YC is optional for startup searches. Existing saved source selections are preserved. At least one source must be selected. Searches remain paused until you enable them.

One CV, goal, set of target titles, location constraints, salary/equity expectations, and dealbreakers guide every source. Use the goal and dealbreakers to specify company stage, industry, ownership, and your desired path toward founding a company. This version assesses job-listing evidence; it does not independently investigate funding, founders, or cap tables.

- **LinkedIn:** bounded public guest searches by title/location, as described below.
- **Y Combinator:** checks the recent public jobs page, filters title keywords, then reads matching job pages including visible compensation and visa details. This is not a search across every YC opening. [YC jobs](https://www.ycombinator.com/jobs/role/all).
- **Company career pages:** add up to five HTTPS board URLs on `jobs.ashbyhq.com`, `boards.greenhouse.io`, or `job-boards.greenhouse.io`. These watch specific companies, not all employers on those platforms. Data comes from the documented [Ashby posting API](https://developers.ashbyhq.com/docs/public-job-posting-api) and [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html). Company labels use their board names.
- **Wellfound and Indeed:** manual links are provided; scheduled connectors are not implemented. They are never presented as active search sources.

For YC/company feeds, target-title words narrow discovery. Remote-only requires a remote indication in the listing; location/work-authorization eligibility is then evaluated against the profile. Each result preserves its original source link. The source filter also includes historical results from sources you later disable.

Disabled sources and removed company boards are excluded from future discovery, pending evaluation, and new emails. Pending digests that include a disabled source are held for review. A source failure appears in Activity and does not prevent other selected sources from working. The AI evaluation allowance is shared across sources in turn. Exact URLs and matching company/title/location combinations are flagged as possible duplicates across sources, including archived records. Duplicates stay visible, but are excluded from evaluations and alerts until marked as a separate opportunity. This is conservative matching, not verified employer identity; confidential recruiters and differing company aliases still need human review.

## Retrieval and scoring boundaries

- Uses LinkedIn's public guest job-search and description endpoints over HTTP. No LinkedIn login, cookies, or browser session is required by this adapter. These are unofficial endpoints; changes, throttling, and access challenges are reported, and requests stop on access restrictions.
- One page per title/location combination, sorted by date and restricted to the configured posting window (1–90 days, default 7). This is bounded discovery, not exhaustive LinkedIn coverage or a personalized feed. Maximum 4 titles × 3 locations; requests are paced. Jobs visible only while signed in and founder feed posts are outside this adapter.
- Up to the configured number of new or pending jobs are evaluated per run (default 10). Descriptions are cached. Already-scored jobs are skipped until matching preferences change. Material edits to existing job descriptions are not monitored in this first version.
- The model receives CV text, preferences, and the job description. It has no tools. Equity/salary/founder-path evidence must be exact excerpts from the source; unsupported excerpts are discarded. Eligibility uncertainty is visible.
- The dashboard retains every stored job and renders 50 at a time with Show more; it shows the last 30 runs. This single-Droplet version loads the account list into memory; server-side pagination is a future scaling improvement. Scores are review aids, not verified claims about employers or guarantees of fit.
- Email delivery uses a persistent outbox and Resend idempotency keys. After 23 hours, uncertain deliveries are marked for manual review rather than risking a duplicate. Review entries in Activity and confirm delivery in Resend; there is no automatic resend after that point.
- Requests are bounded by count and time. Each account has a daily AI generation limit (default 50), and AI_DAILY_CALL_LIMIT caps all accounts combined (default 500). Reservations include failed calls and strategy imports and reset at midnight UTC. Each generation records an ID, account, model, kind, status, timestamps and token counts in accounts.sqlite; source/CV text is not logged there. Run history also records tokens. These are call limits, not dollar budgets: set a financial spending limit at the provider too. SDK retries can make more than one underlying request per reserved generation.
- SQLite's write lock and a renewable run lease prevent overlapping scans. A stopped worker's lease expires and the next tick marks its run as failed.

## Credentials still needed for a live deployment

DigitalOcean SSH host/access and domain, AI credentials, and (for email) a verified sender and email API key. CV, preferences, and destination email are entered once in the app. Local parser, database, workflow, and browser checks do not substitute for a real model/email test once those credentials are configured.

## Personal strategy and research workflow

Search profile now includes citizenship context, relocation preferences, and explicit country work-access rules. Citizenship alone never establishes authorization. Use two-letter ISO country codes; user-declared existing work rights and country-specific sponsorship policies determine how evidence is treated. If country rules exist, an unmatched/unclear location is held for research. Remote does not automatically imply worldwide access. Model extraction can be wrong; examine the quoted evidence.

Optional must-have requirements sit outside the numeric score. Evidence-backed failure excludes a role, and the user selects what unknown evidence means: research, exclude, or keep for clarification. A high score cannot override these gates. No founder requirement is enabled by default.

Scoring uses editable groups and criteria with 1–5 rubrics and relative weights. Group averages are rounded to one decimal, then combined and rounded to one decimal before scaling to 0–100. Optional caps use criterion thresholds. Missing/unsupported criterion evidence remains visibly unknown and contributes 1 conservatively. This supports a personal 65/35 grouped formula and 70/100 cap without imposing it on other users. Qualification changes invalidate previous scores; tracking edits do not.

Markdown/TXT import accepts up to 40,000 characters. A real model call proposes a draft, including any unsupported/omitted details. Review it, add it to the form, then explicitly save. It cannot replace the CV, change notification recipients, turn searches on, contact people, or execute instructions in the document. Five imports per account per UTC-sized 24-hour rate-limit window are allowed; the shared generation budget also applies. No personal founder brief is bundled into global defaults.

Opportunities have separate recommendations and application stages. A working, freshly checked application form is required for Apply; unverified or stale routes become Apply + verify. Track next actions, notes and optional follow-up dates. Not recorded never implies not applied. Research queue also stores manually entered exploratory companies and recruiter leads without asserting a vacancy or employer verification. No outreach or applications are sent.

Application checks use bounded public HTTPS requests, validate and pin public DNS addresses, restrict redirects, and inspect reachable forms. Closed or unavailable pages exclude a role; access challenges, JavaScript-only forms, and ambiguous pages remain unknown. The worker checks at most three stale/unverified listings each run; a per-job button checks on demand. Freshness expires after 14 days. This is not a guarantee that submission will succeed and does not authenticate to portals.

Still outside this release: autonomous company-first discovery and funding/founder research, cofounder matching, problem-discovery sprints, Google Sheet synchronization, automatic follow-up emails, and scheduled Wellfound/Indeed connectors. Those portals remain manual links. The research queue supports keeping human research while the advertised-job search runs.
