# RTL Logical-Properties Audit

Pass executed by Wave-2 Agent W3 (mobile + RTL polish).

## What changed

Replaced hard-coded directional Tailwind classes (`ml-*`, `mr-*`, `pl-*`,
`pr-*`, `left-*`, `right-*`, `border-l-*`, `border-r-*`) with their
logical-property counterparts (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`,
`end-*`, `border-s-*`, `border-e-*`) on the most visible
user-facing surfaces.

Also wired `<html dir="rtl">` for the `ar-*` locale in `app/layout.tsx`
so the logical properties actually flip — without `dir`, `ms-` and
`me-` resolve identically to `ml-` and `mr-`.

## Conversions

| File | Change |
|------|--------|
| `app/layout.tsx` | added `dir={locale.startsWith("ar") ? "rtl" : "ltr"}` on `<html>` |
| `app/_components/Landing.tsx` | `ml-auto` → `ms-auto` (top-nav right cluster); `ml-2` → `ms-2` (window title); `ml-1` → `ms-1` (pricing tier `/mo` suffix); `left-[6%]` → `start-[6%]`, `right-[6%]` → `end-[6%]` (faux desktop windows) |
| `app/_components/MarketingShell.tsx` | `ml-auto` → `ms-auto` (footer copyright); `padding-left` → `padding-inline-start` (prose-sf `<ul>`) |
| `app/pricing/page.tsx` | `ml-auto` → `ms-auto` (top-nav right cluster) |
| `app/pricing/_components/ComparisonTable.tsx` | `ml-2` → `ms-2` (Popular pill) |
| `app/pricing/_components/TierCard.tsx` | `right-6` → `end-6` ("Most popular" ribbon) |
| `app/tasks/_components/TaskHeader.tsx` | `ml-auto` → `ms-auto` (Delete button) |
| `app/people/time-off/page.tsx` | `mr-3` → `me-3` (UAE holiday legend chip) |
| `app/people/[id]/_DocumentUpload.tsx` | `file:mr-2` → `file:me-2` (file input button) |
| `app/changelog/page.tsx` | `border-l-2` → `border-s-2`, `pl-6` → `ps-6` (timeline list items) |
| `app/account/security/_components/FactorList.tsx` | `ml-2` → `ms-2` (factor remove error) |
| `components/UndoSnackbar.tsx` | `left-4` → `start-4` (toast anchor); `ml-1` → `ms-1` (dismiss button) |
| `components/PWAInstallPrompt.tsx` | `left-4` → `start-4` (prompt anchor) |
| `components/PushPermissionPrompt.tsx` | `left-4` → `start-4` (prompt anchor) |
| `components/SiteBanner.tsx` | `left-0 right-0` → `inset-x-0` (banner anchor); `ml-2` → `ms-2` (body separator) |
| `components/Toaster.tsx` | `right-4` → `end-4` (toaster anchor); `ml-1` → `ms-1` (dismiss button) |
| `components/CookieConsent.tsx` | `right-4` → `end-4` (consent card anchor) |
| `components/WhatsNew.tsx` | `ml-4` → `ms-4` (release-note list) |
| `components/NotificationBell.tsx` | `-right-1` → `-end-1` (unread badge); `right-0` → `end-0` (dropdown panel) |
| `components/CommentsThread.tsx` | `ml-8` → `ms-8` (×2 reply indents) |
| `components/TagChip.tsx` | `ml-0.5` → `ms-0.5` (remove × icon) |
| `components/MentionInput.tsx` | `left-0 right-0` → `inset-x-0` (suggestion dropdown) |

**Total: ~28 conversions across 21 files.**

## What's NOT converted yet

This was a high-visibility pass. Plenty of surfaces still use directional
classes — the next pass should hit:

- `app/admin/*` (intentionally left alone per the W3 brief — admin
  internals are LTR-only)
- `app/tools/_components/*` (the desktop OS shell — owned by another
  agent stream; do not edit blindly because Window/Snap positioning
  depends on physical left/right)
- `app/blog`, `app/learn`, `app/community` long-form content surfaces
- Per-tool app surfaces under `app/tools/<slug>/_app.tsx` (high volume,
  low Arabic-usage signal; convert opportunistically)
- The TopBar / Dock / Launchpad — these encode physical position
  semantics for window snapping, so they need a deliberate design
  decision (true RTL flip vs hold position) before mechanical conversion

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean (exit 0).
- Visual check still pending; the conversions are mechanical and Tailwind
  emits `ms-*` / `me-*` / `start-*` / `end-*` via `margin-inline-*` /
  `inset-inline-*` so the LTR rendering is identical to the previous
  `ml-*` / `mr-*` / `left-*` / `right-*`.

## Arabic font note

`app/layout.tsx` does NOT add the `arabic` subset to Inter — Inter
doesn't ship one. The `ar-AE` locale falls back to the system Arabic
face (San Francisco Arabic on iOS/macOS, Segoe UI Arabic on Windows,
Noto Naskh on Linux). That's the preferred behaviour vs shipping a
second family (Cairo / Tajawal / IBM Plex Arabic) and doubling the
font payload for the small ar-AE audience. If marketing later wants
brand-consistent Arabic, swap to a font like Cairo or Noto Naskh and
list it after Inter in the CSS stack.
