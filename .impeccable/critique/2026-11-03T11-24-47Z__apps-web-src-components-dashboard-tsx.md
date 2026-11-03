---
target: JobScout AI UI review
total_score: 23
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/otto/Local/personal/job-searcher/apps/web/src/components/dashboard.tsx"
target_fingerprint: "sha256:d237b5c1e63b56cfa8b8efa27f0844dd2a887fa62dbd2118c0e16682be78be45"
target_path: /Users/otto/Local/personal/job-searcher/apps/web/src/components/dashboard.tsx
timestamp: 2026-11-03T11-24-47Z
slug: apps-web-src-components-dashboard-tsx
closed: true
---
# JobScout AI UI review — 2026-11-03

Target: apps/web/src/components/dashboard.tsx and supporting web UI.
Two independent assessments: design review completed before detector findings entered synthesis.

Yes—the UI can be improved substantially while preserving its dark palette and sage-green accent. The main opportunity is to make opportunity review and the next useful action more prominent.

## Scope and specificity

Login, signup, and recovery were inspected in the local browser at desktop and 390×844 mobile sizes. Authenticated dashboard, onboarding, CV builder, and settings findings are source-based and provisional; no account was created or private workflow executed. No application code was changed.

The visual system is coherent but moderately generic: near-black panels, restrained green actions, and repeated bordered containers. Product character comes from conversational preferences and evidence behind matches. Preserve that identity and focus refinements on task hierarchy.

## Heuristic assessment

Scores are review judgments, not automated accessibility certification. Authenticated behavior remains unverified.

| Heuristic | Score /4 | Main evidence |
|---|---:|---|
| System status | 2 | Busy labels exist; dashboard polling errors disappear and job updates lack pending feedback. |
| Real-world language | 3 | CV and opportunity terms are clear; “Worker not connected” exposes infrastructure. |
| Control and freedom | 2 | Archive restoration and CV warnings exist; dashboard navigation replaces browser history. |
| Consistency | 3 | Shared tokens and components; signup omits the language selector. |
| Error prevention | 3 | Email/password constraints and account confirmation; job actions lack busy guards. |
| Recognition over recall | 2 | Labeled navigation and reasons; tracking is buried alongside evidence. |
| Efficiency | 1 | Filters exist; repetitive individual job actions slow review. |
| Minimalism | 3 | Auth is focused; dashboard mixes chat, metrics, status, filters, and cards. |
| Error recovery | 2 | Failed chat text is restored; refresh failure has no recovery prompt. |
| Help | 2 | Contextual CV and evidence guidance; disconnected search needs actionable help. |
| **Total** | **23/40** | **Provisional: significant opportunities for improvement.** |

## What works

- Calm authentication, clear labels, strong primary actions, correct autocomplete, and helpful password guidance. Mobile login/signup have no horizontal overflow at 390px.
- Match explanations separate reasons, concerns, and listing evidence rather than hiding uncertainty.
- CV onboarding offers two steps, text review, format guidance, and storage reassurance.

## Priority issues

1. **[P1] Results follow a large chat on mobile.** Source order places chat first (`dashboard.tsx:88`); at ≤1000px it takes 68dvh and retains a 420px minimum (`globals.css:2672`, `:2755`). Returning users must pass the editor before reaching opportunities. Lead with results and collapse chat into “Refine search.” Suggested command: `$impeccable adapt`. Source-inferred.
2. **[P1] Search failures do not provide a clear next step.** “Worker not connected” appears in the normal status strip (`dashboard.tsx:91`); polling errors are swallowed (`:41`). Explain the unavailable state in plain language, show the last successful check, clarify queued-search status, and provide an appropriate recovery action. Suggested command: `$impeccable harden`. Source-inferred.
3. **[P2] Seven equal-level filters mix different tasks.** Fit, saved state, research, application progress, and archive compete (`dashboard.tsx:94`). Keep All/Strong/Saved prominent, separate application workflow, and move Archive to secondary navigation. Separate tracking from evidence (`tracking-editor.tsx:10`). Suggested command: `$impeccable distill`. Source-inferred.
4. **[P2] Small controls and weak job-action feedback.** Password visibility is 34×34px in the browser; job Save/Dismiss controls are small in source and have no local pending state (`dashboard.tsx:72`, `:145`). Use 44px touch areas, enlarge essential secondary text, show saving state, and provide undo for archiving. Expose selected filters through `aria-pressed`. Suggested command: `$impeccable polish`. Auth target size verified; job behavior source-inferred.
5. **[P2] Signup removes language selection.** Verified desktop/mobile and in `login.tsx:15`. Keep the selector in the same place across login, signup, and recovery. Suggested command: `$impeccable clarify`.

## Cognitive load and emotional journey

Authentication is low effort. The dashboard source suggests moderate load: seven filters exceed a simple choice set, and preference editing competes with reviewing opportunities. Collapsible evidence and source controls are good. Calm entry and reassuring CV copy can give way to uncertainty when the first search is empty or disconnected; replace that valley with a clear status and next action.

## Persona red flags

- **Power user:** repeated individual save/archive operations and lost browser-back history slow review.
- **Accessibility-dependent user:** selected filters lack `aria-pressed`; job-action success is not clearly announced. Existing labels and focus styles are useful foundations.
- **Distracted mobile user:** the assistant precedes results, small controls are harder to hit, and unsent local input can be lost on refresh.

## Technical scan and minor observations

One scan of apps/web/src returned **2 warnings, 0 errors**. `side-tab` at `globals.css:1277` is likely a false positive: a neutral grouping border. `layout-transition` at `globals.css:1515` flags a width animation on a small native progress bar; low priority, with no jank observed. No dashboard.tsx detector findings. These checks do not certify accessibility or performance.

Desktop login content extends below a 720px viewport, though mobile content fits 844px. Repeated aspirational headers use valuable operational space. Recovery omits the compass mark. Keep uncertainty close to numeric fit scores.

## Decisions for the next pass

- First priority: results and mobile hierarchy; status clarity and accessibility; or visual polish only?
- Scope: the top three improvements or all five?
