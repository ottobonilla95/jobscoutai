# {{name}}

An account-based job-search app and scheduled worker. Next.js provides the dashboard; the TypeScript worker searches your selected job sources, evaluates new results against your CV, and optionally emails matches. Vercel hosts the web app, DigitalOcean runs the worker, and Neon PostgreSQL stores accounts, settings, jobs, and delivery history. Every private-data query is scoped to its account.

## Product configuration

Edit `config/product.json` to change the product name, package/image slug, or HTTP user agent. The frontend and worker both import `packages/core/src/brand.ts`; translated copy interpolates `{productName}` instead of hardcoding a name.

After editing the configuration, run `npm run brand:sync`. It updates package metadata/lockfile, Docker Compose, systemd units, the timer installer, and this README from `config/templates`. Edit templates for changes to generated files. `npm run brand:check` detects stale generated output and runs before builds and tests. Rebuild and restart the web app and worker to apply a branding change.

The `compatibility` settings deliberately preserve existing cookie names, the Compose project/volume, timer identifiers, and install path. These are storage/session identities, not display branding. Changing them requires a separate migration. Existing `.env` paths, database records, and queued email payloads are preserved. Set `EMAIL_FROM` to a verified address with your desired sender display name; branding configuration does not rewrite provider credentials.

## Projects

- `apps/web`: Next.js dashboard, email/password signup and sign-in, CV import, preferences, results, and run history.
- `apps/worker`: a short-lived scheduler/worker process.
- `packages/core`: LinkedIn, Y Combinator, Ashby, and Greenhouse retrieval, model scoring, storage, and notification delivery.
- `deploy`: DigitalOcean Docker Compose, HTTPS proxy, systemd search/backup timers.

Requires Node.js 24+ and PostgreSQL.

## Local setup

```bash
npm ci
npm run setup
```

Open `.env` locally. Add these platform credentials once; users do not need their own model key:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key for CV-based evaluation, profile suggestions, and strategy imports. Used directly by the server and worker. |
| `AI_GATEWAY_API_KEY` | Optional AI Gateway alternative when `OPENAI_API_KEY` is not set. |
| `AI_MODEL` | Defaults to `openai/gpt-5.4-mini`, a capable, affordable model with structured output support. |
| `AI_REASONING_EFFORT` | Defaults to `medium`. Keep an OpenAI reasoning model when using this provider option. |
| `RESEND_API_KEY` | Needed only for email notifications. |
| `EMAIL_FROM` | A sender verified in your Resend account, e.g. `{{name}} <jobs@your-domain.com>`. |
| `APP_URL` | Exact browser origin; locally `http://localhost:3000`. Used for origin validation and email links. |
| `DATABASE_URL` | Shared PostgreSQL connection for web and worker; use the Neon pooled URL with TLS. |
| `DATABASE_URL_UNPOOLED` | Optional direct PostgreSQL connection for backups. |
| `DATA_DIR` | Local backup output directory only. |

Start the website and local worker scheduler in separate terminals:

```bash
npm run db:migrate
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

## Vercel + DigitalOcean deployment

1. Import the repository into Vercel with Root Directory `apps/web`, Next.js preset, install command `cd ../.. && npm ci`, and build command `cd ../.. && npm run build`. Include files outside the root directory.
2. Connect Neon to the Vercel project. It provides `DATABASE_URL`. Set `APP_URL` to the exact production origin. Keep all database and model credentials server-side.
3. Use the same database URL locally to run `npm run db:migrate` once before deploying code that depends on new tables. Migrations are versioned, transactional, and safe to rerun. They never run from a user request or automatically during a preview build.
4. For previews, use a separate Neon branch before testing changes that affect real data. Connecting the same Neon resource to Production and Preview may initially share data.
5. Put the worker code in `{{installDirectory}}` on DigitalOcean. Install a dedicated Node 24 runtime in `{{installDirectory}}/runtime` and dependencies with `npm ci --omit=dev`. Do not replace another application's global Node installation.
6. Create a `jobscout` system user, own the worker directory with that user, and create a private `.env` (mode 600). Set `DATABASE_URL`, `APP_URL`, AI credentials, and optional email credentials there. No inbound database port is needed on the Droplet.
7. Run `sudo bash deploy/install-timers.sh`. The service runs once and exits; systemd schedules subsequent invocations. The worker needs outbound HTTPS and PostgreSQL connectivity.

The default timer checks every 15 minutes so it does not keep Neon continuously awake with minute-by-minute polling. Manual searches can wait up to 15 minutes plus any current run. Users choose a frequency at or above `MIN_SEARCH_INTERVAL_HOURS` (default 4; valid range 2–168). Set the same value on web and worker deployments. Existing shorter intervals are raised to the minimum when read, and the worker enforces the minimum against the last run even for manual requests. Explicit operator force runs bypass the cooldown. At most one due account runs per tick, so a larger installation should increase dispatch capacity and review its database compute plan.

```bash
journalctl -u {{servicePrefix}}-worker.service -n 100
systemctl list-timers {{servicePrefix}}-worker.timer
sudo systemctl start {{servicePrefix}}-worker.service
npm run check:database # temporary synthetic accounts; verifies then removes them
```

For updates, stop the timer, wait for any active worker, copy the new code, install dependencies, apply any migration, then restart the timer. Secrets are never part of the Git repository.

The Docker Compose deployment remains an alternative for hosting both processes yourself. Set the same PostgreSQL URL, run the migration on the host first, then `docker compose up -d web caddy`. Invoke the worker with `docker compose --profile worker run --rm worker`; the supplied systemd service is for the native Node deployment.

Backups: `npm run backup` uses `pg_dump` and stores a custom-format dump under `DATA_DIR/backups`. Install a PostgreSQL client version matching or newer than the server first; use `DATABASE_URL_UNPOOLED` when available. The optional backup timer is not enabled by the installer. Store backups off the Droplet and test recovery with `pg_restore` into a separate database before switching the application connection. Existing local SQLite files are left untouched, but are no longer used by the app; importing legacy data requires an explicit owner mapping.

## Accounts and AI configuration

- Signup requires a valid email format and a 12–128-character password. Passwords use salted scrypt hashes. Sessions use random, opaque cookies; only their hashes are stored. Logout revokes the server-side session. Old shared-password cookies are not accepted.
- Every data route derives account identity from the session. A client cannot select another account with a URL or request field. Private tables use account IDs in their queries and composite keys/foreign keys.
- Login and signup have persistent attempt limits. Manual searches respect the configured minimum between actual runs; repeated queue requests are additionally rate-limited. Set `ALLOW_SIGNUP=false` to close new registrations while preserving existing logins.
- New signups complete a resumable, one-question-at-a-time profile setup before entering the dashboard. CV/experience, a career goal, confirmed target roles, location choice, and work preference are required. Salary, equity, work authorization, and dealbreakers are optional. LinkedIn is selected initially; sources and automatic searches remain editable from Search profile. AI can suggest roles and matching priorities from the CV and answers. If unavailable, users can enter roles themselves and select standard matching. Drafts stay separate from the active profile until completion; existing accounts retain their saved strategies.

Location selection supports up to 10 countries or cities in onboarding and profile settings. “All cities” means country-wide discovery; “Choose cities” scopes suggestions to that country, and selecting a city replaces its country-wide selection. Multiple cities in the same country are supported. Selecting the whole country again replaces its city selections. City queries retain their country and region for discovery and matching.
- Email verification and self-service password recovery are available through the configured email provider. Verification links expire after 24 hours; reset links after 30 minutes. Tokens are hashed, purpose-bound, and single-use. Password reset revokes all sessions. Job notifications require a verified account address. Onboarding email opt-in is saved while verification is pending and activates after verification. Configure delivery and verify the complete email flows before a public launch.
- Existing prototype SQLite files are retained locally and never assigned automatically to a new signup. `APP_PASSWORD` and `SESSION_SECRET` in an old `.env` are ignored.
- Add `OPENAI_API_KEY` in the server `.env` and in the Vercel project's server environment, then restart web/worker services and redeploy Vercel. The AI SDK connects directly to OpenAI using `AI_MODEL` (default `openai/gpt-5.4-mini`) and `AI_REASONING_EFFORT=medium`. Direct requests disable response storage. `AI_GATEWAY_API_KEY` remains an optional alternative when no OpenAI key is configured. This is an API credential, separate from a ChatGPT subscription. The key is never returned to the browser or stored in a user profile.
- `npm run check:ai` tests the configured model with synthetic candidate/job text and reports token usage. It performs a real billable model call. No model connection is claimed until this succeeds. Set provider spending limits before opening the service to many users.

## Intent-based onboarding and search strategy

Onboarding asks up to three optional follow-up questions based on the CV and stated goal, or none when the goal is already clear. Questions can clarify any direction, including part-time work, predictable hours, less stress, more pay, ownership, stability or a career change. Suggested choices are never preselected; users can write their own answers or continue without answering. If AI is unavailable, two general questions provide a manual fallback. Only an answered question explicitly marked “firm requirement” creates a hard gate; preferences guide comparisons and missing evidence remains a research question. Changing the CV or goal requires replacing or clearing outdated answers before activating the draft.

Onboarding automatically proposes role families from the CV, career goal and answered follow-ups. Users review, edit, remove, or add up to four roles; failed AI calls leave manual entry available. Resuming the role step with empty titles also requests suggestions. Changing the CV, goal or clarification answers flags prior generated roles for review without silently replacing confirmed choices. Users review an editable interpretation and matching plan before activation. One active search profile per account is retained.

Run `npm run db:migrate` before deploying this feature to apply migration 003. Role, clarification and matching generations store validated results and token usage in account-owned records, retrievable at `/api/generations/{generationId}`. Draft answers autosave separately from the active search profile.

Search geography uses a searchable country/city picker with up to ten explicit selections. Selecting a whole country replaces its selected cities. Country names are localized from ISO codes; city queries use Photon/OpenStreetMap through an authenticated, rate-limited endpoint, with debouncing, cached retrieval and a six-second timeout. Only the typed location is sent to Photon. Countries remain selectable when city lookup is unavailable. Photon is a public demo service without an availability guarantee; substantial production traffic should use a dedicated geocoder. Existing unfiltered/free-text profiles keep running; editing their search profile requires confirming explicit locations. “Anywhere” is no longer offered as a worldwide search.

Generated matching includes an editable intent, equivalent search titles, listing-evidence priorities and unresolved questions. Confirmed role families take priority and each connector uses at most eight distinct titles in total. Work-access proposals must quote the user's authorization answer and are reviewed by country, including the policy for unstated sponsorship. The CV and search geography never establish work rights. If country rules do not cover all selected countries, the original authorization answer remains an explicit requirement. A complete reviewed country policy avoids a second generic gate contradicting its sponsorship-uncertainty choices.

The strategy is stored with the active profile, passed to job evaluation, and invalidates previous assessments when changed. It guides advertised-vacancy scouting; it does not claim independent company research, tax/living-cost or retained-cash calculations, Google Sheet synchronization, unpaid cofounder evaluation, or multiple simultaneous search profiles. Those are subsequent research-stage capabilities, requiring separate tools, evidence storage and validation.

## CV builder

Open **CV builder** in the workspace to create, save, and duplicate up to 20 CVs per account. Edit contact details, a professional summary, skills, experience, projects, education, courses, and achievements. Entries can be reordered; empty sections are omitted. Signature uses a dark header and teal accents inspired by the reference CV; Minimal uses a simple text layout. Both export A4 PDFs with selectable text, local embedded fonts, page numbers, and automatic page wrapping. The live preview and download use the same PDF document. English and Spanish section headings are selectable independently from your writing.

Save explicitly before leaving; unsaved changes trigger a discard warning. Concurrent edits in another tab require reloading rather than overwriting. **Save and use for matching** copies the chosen CV's text into Search profile and refreshes matching on future searches. Other builder edits and deletion leave the current matching text intact. An optional PDF/DOCX/TXT import supplies reference text for manual copying into fields; automatic field extraction and AI rewriting are outside this version. Export and preview render in the browser without sending document content to an AI provider.

Run `npm run db:migrate` before deploying this feature to apply migration 002. Saved CVs belong to their account and cascade on account deletion. Bundled CV fonts use the SIL Open Font License in `apps/web/public/fonts/OFL.txt`.

## Languages

The interface supports English and Spanish through a shared translation dictionary in `packages/core/src/i18n`. On first visit, the browser's `Accept-Language` preferences choose the best supported language, including regional variants such as `es-MX`. English is the fallback.

The language control shows the current language, **English** or **Español**. Browser detection chooses the initial language. Signed-in users can change it in **Settings → Language**. An explicit account preference takes priority over the browser and follows the account across devices. Before login, a cookie remembers the choice. Browser detection also supplies the language for background searches and emails until an explicit preference is saved.

Interface text, application errors, email templates, and date/number displays are localized. AI evaluation and strategy-import instructions request explanations in the selected language. Original job titles, quoted evidence, CVs, and personal notes are preserved. Changing language marks previous evaluations for reevaluation on a subsequent search; existing generated explanations keep their original language until then. New Spanish accounts receive translated default goal/rubric text. User-authored profile text is never rewritten by a language switch.

Translations are local dictionaries, without a translation service or additional model call. Live model output and email delivery still require configured credentials; automated tests verify the prompts and email payloads.

## Sources and research preferences

In **Search profile → Where to search**, select LinkedIn, Y Combinator, and/or company career pages. LinkedIn is the default for new accounts; YC is optional for startup searches. Existing saved source selections are preserved. At least one source must be selected. Searches remain paused until you enable them.

One CV, goal, set of target titles, location constraints, salary/equity expectations, and dealbreakers guide every source. Use the goal and dealbreakers to specify company stage, industry, ownership, and your desired path toward founding a company. This version assesses job-listing evidence; it does not independently investigate funding, founders, or cap tables.

- **LinkedIn:** bounded public guest searches by title/location, as described below.
- **Y Combinator:** checks the recent public jobs page, filters title keywords, then reads matching job pages including visible compensation and visa details. This is not a search across every YC opening. [YC jobs](https://www.ycombinator.com/jobs/role/all).
- **Company career pages:** add up to five HTTPS board URLs on `jobs.ashbyhq.com`, `boards.greenhouse.io`, or `job-boards.greenhouse.io`. These watch specific companies, not all employers on those platforms. Data comes from the documented [Ashby posting API](https://developers.ashbyhq.com/docs/public-job-posting-api) and [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html). Company labels use their board names.
- **Wellfound and Indeed:** manual links are provided; scheduled connectors are not implemented. They are never presented as active search sources.

- **Colombia:** searches explicitly targeting Colombia (or a recognized Colombian city such as Bogotá or Medellín) automatically add Get on Board, ElEmpleo, and Michael Page Colombia. The country-source catalog lives in `packages/core/src/country-sources.ts`; it uses search locations, never citizenship or work-authorization rules. No database migration is needed. Get on Board uses its public keyword/country API with expanded employer and location evidence. ElEmpleo and Michael Page read public role/location search pages and fetch descriptions only for jobs selected for evaluation. Each connector checks one bounded results page per title/location, stops on access challenges or unrecognized responses, and reports failures without discarding successful sources. Removing Colombia disables evaluation and alerts for those sources. Remote restrictions, listing age, the shared evaluation budget, and your matching profile still apply. Remote country/region restrictions are preserved; remote never implies worldwide eligibility. Computrabajo, SENA, and Magneto are not connected.

For YC/company feeds, target-title words narrow discovery. Remote-only requires a remote indication in the listing; location/work-authorization eligibility is then evaluated against the profile. Each result preserves its original source link. The source filter also includes historical results from sources you later disable.

Disabled sources and removed company boards are excluded from future discovery, pending evaluation, and new emails. Pending digests that include a disabled source are held for review. A source failure appears in Activity and does not prevent other selected sources from working. The AI evaluation allowance is shared across sources in turn. Exact URLs and matching company/title/location combinations are flagged as possible duplicates across sources, including archived records. Duplicates stay visible, but are excluded from evaluations and alerts until marked as a separate opportunity. This is conservative matching, not verified employer identity; confidential recruiters and differing company aliases still need human review.

## Retrieval and scoring boundaries

- Uses LinkedIn's public guest job-search and description endpoints over HTTP. No LinkedIn login, cookies, or browser session is required by this adapter. These are unofficial endpoints; changes, throttling, and access challenges are reported, and requests stop on access restrictions.
- One page per title/location combination, sorted by date and restricted to the configured posting window (1–90 days, default 7). This is bounded discovery, not exhaustive LinkedIn coverage or a personalized feed. Maximum 8 search titles (confirmed roles plus equivalents) × 10 locations; requests are paced. Jobs visible only while signed in and founder feed posts are outside this adapter.
- Up to the configured number of new or pending jobs are evaluated per run (default 10). Descriptions are cached. Already-scored jobs are skipped until matching preferences change. Material edits to existing job descriptions are not monitored in this first version.
- The model receives CV text, preferences, and the job description. It has no tools. Equity/salary/founder-path evidence must be exact excerpts from the source; unsupported excerpts are discarded. Eligibility uncertainty is visible.
- The dashboard retains every stored job and renders 50 at a time with Show more; it shows the last 30 runs. This single-Droplet version loads the account list into memory; server-side pagination is a future scaling improvement. Scores are review aids, not verified claims about employers or guarantees of fit.
- Email delivery uses a persistent outbox and Resend idempotency keys. After 23 hours, uncertain deliveries are marked for manual review rather than risking a duplicate. Review entries in Activity and confirm delivery in Resend; there is no automatic resend after that point.
- Requests are bounded by count and time. Each account has a daily AI generation limit (default 50), and AI_DAILY_CALL_LIMIT caps all accounts combined (default 500). Reservations include failed calls and strategy imports and reset at midnight UTC. Each generation records an ID, account, model, kind, status, timestamps and token counts in PostgreSQL; source/CV text is not logged there. Run history also records tokens. These are call limits, not dollar budgets: set a financial spending limit at the provider too. SDK retries can make more than one underlying request per reserved generation.
- PostgreSQL transactions, row locks, and a renewable run lease prevent overlapping scans. A stopped worker's lease expires and the next tick marks its run as failed.

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
