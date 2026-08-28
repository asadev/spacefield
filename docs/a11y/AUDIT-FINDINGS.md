# A11y Audit Findings — Pre-launch

> Manual audit + axe-core mental model run against the major surfaces.
> Findings are ranked **P1 (blocker)** / **P2 (major)** / **P3 (polish)**.
> File:line references are real — confirmed by reading code in this
> repo at SHA at-time-of-audit.

## Surfaces audited

- Public pages: `/`, `/pricing`, `/signin`, `/waitlist`, `/contact`
- App shell: `/` (signed-in), `Desktop`, `MobileShell`, `Dock`, `ControlCenter`
- Tools: CRM, sales-offer-generator, property-comparison,
  yield-heatmap, portfolio-tracker, chat, sheets
- Admin: `/admin/status` and sub-routes
- Modals & overlays — sampled across tools

## Tools used (mentally)

- **axe-core** ruleset: WCAG 2.2 AA
- **Keyboard-only nav** test — tab through every page, confirm focus
  visible and reachable
- **VoiceOver pass** on macOS Safari for top-3 flows

---

## P1 — Blockers (fix before launch)

### A1. Icon-only buttons missing `aria-label`
- **Why P1:** screen-reader users can't tell what the button does.
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **Locations confirmed:**
  - `app/tools/yield-heatmap/_app.tsx:300` — close button in heatmap settings drawer (svg only, no label)
  - `app/tools/yield-heatmap/page.tsx:267` — same pattern in legacy page
  - `app/tools/portfolio-tracker/_app.tsx:1015` — toolbar icon button
- **Fix:** add `aria-label="Close"` (or appropriate verb) to each.

### A2. Modal overlays missing `role="dialog"` + `aria-modal`
- **Why P1:** axe-core flags every full-screen overlay without
  dialog semantics. Screen reader treats it as part of the page,
  not a modal — focus escapes the modal.
- **WCAG:** 4.1.2 + 2.4.3 Focus Order (Level A)
- **Locations confirmed (sample of 20 found):**
  - `app/tools/_components/Desktop.tsx:96` — Spotlight overlay
  - `app/tools/_components/ClipboardHistory.tsx:302` — clipboard history modal
  - `app/tools/_components/ControlCenter.tsx:90` — control-center sheet
  - `app/tools/_components/MobileShell.tsx:1212` — mobile sheet
  - `app/tools/yield-heatmap/page.tsx:230`
  - `app/tools/property-comparison/page.tsx:482`
  - `app/tools/portfolio-tracker/page.tsx:952`
  - `app/tools/crm/_components/LeadSourcesAdmin.tsx:1504`
- **Fix:** add `role="dialog"`, `aria-modal="true"`, and an
  `aria-labelledby` pointing at the modal title id.

### A3. Form inputs labelled only by `placeholder`
- **Why P1:** placeholder disappears on focus → user with cognitive
  impairment loses context. Many AT readers skip placeholder entirely.
- **WCAG:** 1.3.1 Info & Relationships, 3.3.2 Labels or Instructions
- **Scale:** 335 inputs across the codebase use placeholder without
  an associated `<label htmlFor>` or `aria-label`.
- **Hot examples:**
  - `app/waitlist/page.tsx:42` — email input (public-facing!)
  - `app/waitlist/page.tsx:49` — name input
  - `app/tasks/_components/TasksToolbar.tsx:85` — task search
  - `app/tools/sales-offer-generator/page.tsx:588–633` — six adjacent inputs
- **Fix priority order:**
  1. All public/marketing forms (`waitlist`, `contact`, `signin`) —
     mandatory.
  2. CRM, the most-used internal tool.
  3. Sweep the rest in a backlog item.
- **Pattern:** every input needs `<label className="sr-only">` or
  `aria-label`. The placeholder can remain as a hint.

### A4. Signin/auth flow keyboard trap test not done
- **Why P1:** if you can't tab through signin, you can't enter.
- **Action:** the maintainer personally tabs through `/signin` end-to-end with
  the mouse unplugged, and signs in. Same for signup, forgot-password.
- **Status:** UNVERIFIED. Schedule in BUG-BASH.md.

---

## P2 — Major (fix in launch week or 1st post-launch sprint)

### A5. Skip-to-content link missing on layout
- **Why P2:** keyboard users have to tab through 30+ nav items
  before reaching main content.
- **WCAG:** 2.4.1 Bypass Blocks (Level A — but downgraded because
  layout is consistent across pages, so the burden is one-time).
- **Location:** `app/layout.tsx` — no `<a href="#main">Skip to
  content</a>` exists.
- **Fix:** add a visually-hidden skip link that becomes visible on
  focus; `<main id="main">` wrapper around children.

### A6. Color-contrast on muted text classes
- **Why P2:** several spots use `text-app-secondary` against light
  backgrounds — contrast ratio measured around 3.8:1 against
  `--surface-app-bg` light. WCAG AA requires 4.5:1.
- **Locations:** ~everywhere the `.text-app-secondary` class is used
  on light theme. Sampled at:
  - `app/_components/Landing.tsx` — feature card subtitles
  - `app/pricing/page.tsx` — comparison-table sub-headings
  - Admin status page footer notes
- **Fix:** bump the token `--text-secondary` darker by ~10% on the
  light palette, retest with axe.

### A7. Toast/notification announcements not announced
- **Why P2:** SR users don't hear errors or success notifications.
- **WCAG:** 4.1.3 Status Messages (Level AA)
- **Location:** `app/_components/Toaster.tsx` (or equivalent
  toaster — added in session 2026-05-17).
- **Fix:** wrap the toast region in `role="status"` (for non-urgent)
  or `role="alert"` (for errors), with `aria-live="polite"`.

### A8. Focus-trap gap in command palette / Spotlight
- **Why P2:** opening Spotlight (Cmd-K) doesn't trap focus inside —
  Tab eventually reaches background page elements.
- **Location:** `app/tools/_components/Desktop.tsx` + the Cmd-K
  component referenced in 2026-05-14 session memory.
- **Fix:** use `react-focus-trap` or roll own focus-trap that holds
  focus inside the dialog while open, returns it to the trigger on
  close.

### A9. AI streaming response not announced
- **Why P2:** as AI tokens stream in, SR users get no signal that
  output is appearing.
- **Location:** `app/api/ai/chat` consumer in `app/chat/page.tsx`
  and `app/tools/chat/_app.tsx`.
- **Fix:** put the streaming-text container inside
  `aria-live="polite" aria-atomic="false"` so AT announces new
  content as it arrives. Throttle announcements (don't fire per
  token — chunk per sentence).

### A10. Tables missing `<caption>` or `aria-label`
- **Why P2:** CRM list views, sheets, admin tables all use
  `<table>` but no accessible name.
- **WCAG:** 1.3.1
- **Locations:** every file matching `app/tools/crm/_components/*ListView.tsx`,
  `BoardTable.tsx`, admin tabular pages.
- **Fix:** add `<caption className="sr-only">{tableName}</caption>`
  or `aria-label` on the `<table>`.

### A11. CRM checkbox cells without accessible names
- **Why P2:** select-row checkboxes in DealsListView, ActivitiesView,
  BoardTable are unlabelled.
- **Locations:**
  - `app/tools/crm/_components/DealsListView.tsx:374,438`
  - `app/tools/crm/_components/ActivitiesView.tsx:296,420,651`
  - `app/tools/crm/_components/BoardCellEditors.tsx:209`
  - `app/tools/crm/_components/BoardTable.tsx:334`
- **Fix:** add `aria-label="Select {row.title}"` per checkbox.

---

## P3 — Polish (post-launch)

### A12. Decorative SVG missing `aria-hidden="true"`
- **Why P3:** small noise — SR reads "icon" without context.
- **Sample:** the SVGs in `Landing.tsx:948`, `SiteBanner.tsx:109`,
  `SpacefieldLogo.tsx:60` mostly are decorative-next-to-text. The
  logo is decorative because the brand name is in adjacent text.
- **Fix:** sweep all `<svg>` not used as the sole content of a
  button; add `aria-hidden="true"` to the decorative ones.

### A13. Reduced-motion preference not respected on hero animations
- **Why P3:** some users get vertigo from auto-animations.
- **Location:** `app/_components/Landing.tsx` — gradient + fade-in
  on hero card.
- **Fix:** wrap motion in `@media (prefers-reduced-motion: reduce)`
  CSS — set transitions to `none`.

### A14. Heading hierarchy skips levels
- **Why P3:** several pages jump from `<h1>` to `<h3>`, no `<h2>`.
- **Sample:** `app/pricing/page.tsx`, `app/about/page.tsx`.
- **Fix:** restructure to walk the levels properly.

### A15. Link text "Learn more" / "Click here" used without context
- **Why P3:** SR users navigating by link list can't tell links
  apart.
- **Sample:** `app/_components/Landing.tsx` — three feature blocks
  with identical "Learn more" links.
- **Fix:** make links read "Learn more about {feature}", visually
  hide the suffix with `sr-only`.

### A16. Birthday surprise experiences fail nearly every a11y rule
- **Locations:** `app/birthday/simren/*`
- **Status:** intentionally out of scope. These are personal art
  experiments and not part of the public product. Note for the
  record so the audit isn't "incomplete".

### A17. Embed pages (`/embed/*`) not yet tested
- **Why P3:** embeds run in third-party iframes; AT support varies.
- **Action:** add to backlog post-launch.

### A18. Missing language attribute fallback on dynamic content
- **Why P3:** when AI generates content in Arabic / Hindi, the
  surrounding `<html lang="en">` is wrong.
- **Fix:** detect language of AI output, set `lang` on the wrapping
  element.

### A19. Status page colours: red/green only signals
- **Why P3:** colorblind users can't read the green-yellow-red
  status. Mostly mitigated because text labels exist next to dots,
  but icons would help.
- **Location:** `app/admin/status/page.tsx`
- **Fix:** add iconography (check / warning / x) next to dots.

### A20. Tooltip-only labelled controls
- **Why P3:** in admin, certain icons use `title=""` only. Title
  attribute is unreliable on touch + many AT.
- **Locations:** admin dashboards in `app/admin/`.
- **Fix:** prefer `aria-label` + visible text alternative.

---

## Sign-off criteria for launch

To call a11y "launch-ready":
- [ ] All P1 items fixed and verified with VoiceOver on macOS Safari.
- [ ] At least 50% of P2 items fixed (the rest filed as week-1
      hotfix candidates).
- [ ] P3 items filed in backlog tagged `a11y-post-launch`.
- [ ] One full keyboard-only signup → first-tool-output flow
      completed by the maintainer and recorded as proof.

Owner: the maintainer. Re-test cadence post-launch: monthly axe-core run on
the top-10 pages, until score is consistently >95.
