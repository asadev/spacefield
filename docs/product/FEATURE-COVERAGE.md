# Feature coverage — empty/error/loading/mobile/RTL/a11y matrix

For every major user-facing surface, how complete is the polish on
the six dimensions below? Scored 0–3:

- **0** — missing entirely; the surface breaks or shows a stack
  trace / blank screen.
- **1** — present but raw (default browser empty state, default
  error string, no spinner).
- **2** — designed and useful, but with known gaps.
- **3** — production-quality across the dimension, tested.

A "3" doesn't mean perfect — it means we can demo it and we'd be
proud. Most surfaces aren't a 3 across the board yet; this matrix
is the source of truth for "what to fix next."

## Legend

| Symbol | Meaning |
| --- | --- |
| Empty | First-visit state when there's no data yet |
| Error | What the user sees when a request fails |
| Loading | Skeletons / spinners / progressive reveal |
| Mobile | < 640 px viewport (phone) |
| RTL | Right-to-left languages (Arabic, Hebrew) |
| a11y | Keyboard nav, focus rings, screen-reader labels, contrast |

## Public marketing surfaces

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| `/` (homepage) | 3 | 2 | 2 | 3 | 1 | 2 |
| `/pricing` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/about` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/changelog` | 2 | 2 | 1 | 3 | 1 | 2 |
| `/blog` (listing) | 2 | 2 | 1 | 3 | 1 | 2 |
| `/help` | 2 | 2 | 1 | 3 | 1 | 2 |
| `/contact` | 2 | 2 | 1 | 2 | 1 | 2 |

Pattern: public marketing is mobile-strong, RTL-weak (we never test
it). a11y is OK but not audited beyond manual keyboard walks.

## Auth + onboarding

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| `/signin` | 3 | 3 | 2 | 3 | 1 | 3 |
| `/auth/locked` | 3 | 3 | 2 | 3 | 1 | 2 |
| Magic-link confirm landing | 2 | 2 | 1 | 2 | 1 | 2 |
| Onboarding (first workspace) | 2 | 2 | 2 | 2 | 1 | 2 |

Sign-in is the most polished surface in the app because every user
hits it. Magic-link landing is least polished — most users only see
it once and it's quick.

## CRM (`/tools/crm` + sub-routes)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| CRM dashboard | 2 | 2 | 2 | 2 | 1 | 2 |
| Contacts list | 3 | 2 | 2 | 2 | 1 | 2 |
| Contact detail | 2 | 2 | 2 | 2 | 1 | 2 |
| Leads pipeline | 2 | 2 | 2 | 1 | 1 | 2 |
| Deals board | 2 | 2 | 2 | 1 | 1 | 2 |
| Forms (builder) | 2 | 2 | 1 | 0 | 1 | 1 |

The pipeline/deals kanban boards are the weakest on mobile —
horizontal scroll on a phone is awkward and we haven't built the
collapsed view. Forms builder is desktop-only by design (drag-drop
column layout).

## Tasks (`/tasks`)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| Task list | 3 | 2 | 2 | 3 | 1 | 2 |
| Task detail | 2 | 2 | 2 | 2 | 1 | 2 |
| Assign / due-date drawer | 2 | 2 | 2 | 2 | 1 | 2 |
| Bulk actions | 2 | 2 | 1 | 1 | 1 | 1 |

Tasks is newer than CRM and benefited from a designed empty state
on day one. Bulk actions UI is keyboard-poor; on mobile the
checkboxes are too small.

## People (`/people`)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| People directory | 3 | 2 | 2 | 3 | 1 | 2 |
| Person detail | 2 | 2 | 2 | 2 | 1 | 2 |
| Time-off | 2 | 2 | 2 | 2 | 1 | 2 |
| Org chart | 2 | 1 | 1 | 1 | 1 | 1 |

Org chart is the weakest sub-surface; SVG layout doesn't reflow on
narrow widths and the focus order goes top-down even when the
visual order is left-right.

## Chat (`/chat`)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| AI chat (main) | 3 | 2 | 3 | 3 | 1 | 2 |
| Conversation history list | 2 | 2 | 2 | 2 | 1 | 2 |
| Slash-command picker | 2 | 2 | 2 | 2 | 1 | 2 |

Chat has best-in-class streaming-state loading (skeleton tokens
appear immediately, real tokens replace them). RTL is unsupported;
a future check.

## Admin (`/admin/*`)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| Admin home (status board) | 3 | 2 | 2 | 1 | n/a | 2 |
| Users | 3 | 2 | 2 | 1 | n/a | 2 |
| Workspaces | 3 | 2 | 2 | 1 | n/a | 2 |
| App registry | 2 | 2 | 2 | 1 | n/a | 2 |
| Banners + maintenance | 3 | 2 | 2 | 1 | n/a | 2 |
| Logs / errors | 2 | 2 | 2 | 1 | n/a | 1 |
| Bulk-action bar | 2 | 2 | 2 | 0 | n/a | 1 |

Admin is desktop-only by design (the bar is high — most admin
operations are reviewed-before-confirmed). Mobile is scored "1"
where it would technically work in a pinch, "0" where the layout
breaks below 768 px. RTL is "n/a" because the admin chrome is
English-only.

## Tools surface (`/tools/*`)

A 60-surface area. Sampling the top 10 by signed-in traffic:

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| `/tools/affordability` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/tools/commission-calculator` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/tools/property-poster-creator` | 2 | 2 | 2 | 1 | 1 | 1 |
| `/tools/sales-offer` | 2 | 2 | 2 | 2 | 1 | 2 |
| `/tools/proposal-gen` | 2 | 2 | 2 | 2 | 1 | 1 |
| `/tools/market-pulse` | 2 | 2 | 2 | 2 | 1 | 2 |
| `/tools/golden-visa-checker` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/tools/dld-fee-calculator` | 3 | 2 | 2 | 3 | 1 | 2 |
| `/tools/quote-builder` | 2 | 2 | 2 | 2 | 1 | 2 |
| `/tools/global-market-comparison` | 2 | 2 | 2 | 2 | 1 | 2 |

The calculator-shaped tools are the most polished — small inputs,
big output card, easy to test. The document-builders (poster, sales
offer, proposal) are weaker on mobile because the canvas isn't
touch-optimized.

## toShare (`/toShare/*` + share viewers)

| Surface | Empty | Error | Loading | Mobile | RTL | a11y |
| --- | --- | --- | --- | --- | --- | --- |
| toShare landing (in app) | 2 | 2 | 2 | 2 | 1 | 2 |
| Shared link viewer | 3 | 2 | 2 | 3 | 1 | 2 |
| Workspace shared-links page | 2 | 2 | 2 | 2 | 1 | 2 |
| Share password-gate prompt | 2 | 3 | 2 | 3 | 1 | 2 |
| Expired/revoked viewer | 3 | 3 | n/a | 3 | 1 | 3 |

Viewers are the polish-priority surface — they're often the first
impression non-Spacefield-users have. Expired/revoked is a "3"
across the board because the surface is tiny (one card) and we
audited it as a brand-touch.

## Summary

| Dimension | Average score (across all rows) |
| --- | --- |
| Empty state | 2.4 |
| Error state | 2.0 |
| Loading state | 1.8 |
| Mobile | 2.0 |
| RTL | 1.0 |
| a11y | 1.8 |

Headline gaps:

1. **RTL is uniformly weak.** We never test it. Top fix: a CI smoke
   pass that loads each route with `dir="rtl"` and screenshot-diffs.
2. **Loading states lag.** Many surfaces show a blank area while
   data fetches; the visible "3" loaders are the exceptions.
3. **a11y is mid-tier.** Keyboard nav works; we lack proper ARIA on
   custom widgets (kanban boards, drag-drop forms builder).

Re-score quarterly.
