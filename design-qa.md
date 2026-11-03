# JobScout AI — option 2 implementation and Impeccable polish

Date: 2026-11-03.

final result: passed

## Source and implementation

- Selected visual truth: `.impeccable/review-evidence/option-2-reference.png`, the second displayed generated image (Review Workspace).
- Implementation: the existing authenticated Next.js application at `http://127.0.0.1:3010/?view=matches`, running the production build.
- Desktop implementation screenshot: `.impeccable/review-evidence/desktop-final.jpg`.
- Source pixels: 1487×1058; implementation/CSS viewport: 1440×1024, screenshot density 1×. Reference normalized to 1440×1024 solely for comparison; aspect-ratio difference below 0.1%.
- State: English, dark theme, All opportunities, four fictional jobs, first job selected, assistant closed. Fictional fixture content follows the chosen mock; matching/recommendation rules remain the real application rules.
- Full-view comparison: `.impeccable/review-evidence/comparison-desktop.jpg` (reference left, implementation right).
- Focused comparison: `.impeccable/review-evidence/comparison-detail.jpg` (detail title, metadata, actions, reasons, concerns).
- Mobile evidence: `mobile-final.jpg` and `mobile-detail.jpg`, 390×844. Intermediate evidence: `tablet-final.jpg`, 1024×900. Spanish evidence: `mobile-spanish.jpg`, 390×844. Paths relative to `.impeccable/review-evidence/`.

## Findings and comparison history

Initial desktop/mobile inspection found two P2 issues: a full extra toolbar row pushed the shortlist below the reference position, and secondary/detail text was too small relative to the selected visual. The toolbar now puts additional existing views behind a labeled native More views control, and desktop body/detail text is 15–16px with larger section headings. The final combined comparisons show the intended shortlist/detail proportions, prominent listing action, and readable hierarchy. No actionable P0/P1/P2 visual differences remain.

Impeccable refinements also provide 44px or larger action areas, explicit filter selection semantics, keyboard focus on the selected detail, a skip link, save/pending feedback, reversible archive, connection/refresh recovery messaging, preserved assistant drafts during internal navigation, and a consistent language selector on signup. Existing profile/activity/CV functionality remains connected.

## Required fidelity surfaces

- **Fonts/typography:** existing system sans retained to match the chosen direction and incumbent product. Main title 28–38px, detail title 25–34px, desktop body 15–16px. Hierarchy, wrapping and weight checked in the combined full/focused comparisons. Phone text remains 14px or above for reading; text inputs use 16px.
- **Spacing/layout:** compact left navigation; shortlist about 41% and detail about 59% of the available review area, separated by a rule. Header actions, row spacing, selected state, and grouped evidence match the target structure. At ≤900px the list and detail become separate views with a Back action. Width checks at 1440, 1024 and 390px found no horizontal page overflow.
- **Colors/tokens:** incumbent near-black surfaces, light text, muted gray and sage primary actions retained. Selection, focus and status use existing semantic tokens. No decorative gradients or image substitutes.
- **Images/icons:** target has no raster illustration/photo assets. Existing Lucide outline icons and compass branding are used; no custom SVG artwork, CSS art, or rasterized interface. The selected image is retained as reference only and is not used as the UI.
- **Copy/content:** real job content, matching thresholds, evidence, uncertainty, localization, and current statuses drive the interface. Newly introduced UI strings have Spanish translations. Generated mock claims are not hardcoded into the application.

## Intentional product differences / P3 follow-up

- Preserve the real recommendation labels and eligibility rules, rather than reproducing the mock's generic “Good match” for every job.
- Scores remain explicitly out of 100 instead of implying a calibrated probability with a percentage.
- Keep actual salary/equity/source/found fields; do not infer a job's work style from a user's preferences. These additional rows put tracking slightly lower than the illustrative mock.
- Retain the existing account footer, navigation icons/count and factual search-date formatting. The decorative REVIEW WORKSPACE kicker is omitted in the Impeccable refinement.
- Native tracking/research/feedback disclosures preserve existing deeper functionality. No new routes, auth bypass, database schema, or provider integration was introduced.

## Functional verification

- Desktop and mobile job selection; keyboard Enter selection focuses the selected heading.
- Save persists, archive removes the job, undo restores its exact previous saved/new status.
- Saved, source, applications and follow-up filters; appropriate empty state and return to All.
- Application stage and next action saved through the existing API and appeared in Applications.
- Assistant opens/closes, keeps an unsent draft, and preserves it across Activity → Opportunities navigation. No AI message was submitted.
- Search now respects the existing minimum interval, then successfully queued when the isolated fixture's run was old enough. Disconnected-service explanation appeared for the queued request even with automatic searching paused. No worker or real search was started.
- A real local database outage left the rendered results visible with an actionable refresh alert; polling recovered and cleared the alert after the database restarted.
- Spanish UI at 390px had `scrollWidth === innerWidth`; original job content remained untranslated, as intended.
- Clean production tab reported no browser console errors or warnings. Earlier network failures during the deliberate outage were expected.
- `npm test`: 147 passed. Post-polish localization checks: 7 passed. `npm run typecheck` passed. Final production build passed, including TypeScript validation. `git diff --check` passed.
- Impeccable's targeted deterministic scan returned `[]` (zero findings); this supplements visual/functional inspection and is not an accessibility certification.

## Preview isolation and remaining limits

The preview uses a dedicated local `jobscout-ui-review` PostgreSQL container on loopback port 5549 and a fictional account (`review@example.test`, password `Local review workspace 2026`). Model and email credentials are inert placeholders/empty; no real account data, AI calls, emails, external research, or deployment was used. Search queues and fixture changes were reset after testing. The production preview and isolated container remain running for inspection; temporary seed/comparison scripts were removed.

Preview process: `npm start` on loopback port 3010. Stop the matching preview process when finished; `docker stop jobscout-ui-review` stops its isolated database. This is local verification, not a deployed production update. Live provider/worker operation was outside the UI pass.

## Implementation checklist

- [x] Implement the selected image in the existing application.
- [x] Preserve real behavior and source/evidence semantics.
- [x] Complete Impeccable refinement and deterministic checks.
- [x] Compare source and rendered output together, including a focused crop.
- [x] Verify desktop, intermediate, mobile, localization and primary interactions.
- [x] Pass build/type checks and relevant tests.

## Post-build hook triage

The stop hook also surfaced two pre-existing rules in `globals.css`. Removed the width transition on the native setup progress bar, preserving its appearance and step values. Kept the `.criterion` grouping border: its neutral `--line` color (#262626) is not the colored accent described by the side-tab warning. Recorded an agent-decided `side-tab` exception scoped to `apps/web/src/app/globals.css` through Impeccable's ignore-value command. No whole-file ignore or project-wide rule ignore was added. The configured scan of this stylesheet now returns zero findings. No findings from this hook remain unreviewed.
