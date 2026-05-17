# Caching Strategy — 2026-05-17

Pragmatic notes on the four layers that keep spacefield.co fast and
fresh: ISR on stable marketing pages, in-memory single-flight for hot
backend reads, `revalidateTag` wiring on admin writes, and a Vary
posture for response correctness behind a CDN.

The intent is "good defaults that don't break runtime correctness." We
do NOT cache anything user-specific behind the CDN; per-user data goes
through `cache: "no-store"` fetches or `dynamic = "force-dynamic"`
routes.

## 1. ISR on stable content pages

Pages declared with `export const revalidate = N` (in seconds):

| Path                         | revalidate | Why                                            |
|------------------------------|-----------:|------------------------------------------------|
| `/`                          |         60 | Marketing shell, client-gated; harmless stale  |
| `/pricing`                   |        300 | Hard-coded tier copy                           |
| `/changelog`                 |        300 | Handcrafted entry list                         |
| `/roadmap`                   |        300 | Handcrafted bucket lists                       |
| `/developers`                |        300 | API docs, deploy-driven                        |
| `/press`                     |       3600 | Rarely-visited press kit                       |
| `/legal/privacy`             |       3600 | Effective-dated, deploy-driven                 |
| `/legal/terms`               |       3600 | Effective-dated, deploy-driven                 |
| `/legal/security`            |       3600 | Trust copy                                     |
| `/legal/subprocessors`       |       3600 | Vendor list                                    |
| `/legal/dpa`                 |       3600 | Boilerplate                                    |
| `/legal/aup`                 |       3600 | Boilerplate                                    |
| `/legal/accessibility`       |       3600 | WCAG statement                                 |
| `/legal/cookies`             |       3600 | Cookie inventory                               |

### Caveat — root layout taints these to dynamic today

The root layout (`app/layout.tsx`) reads runtime brand + banner state
via `lib/runtime-brand.ts` and `lib/runtime-banner.ts`. Both call
`await headers()` to opt the calling tree out of static prerendering
— see the memo in `runtime-banner.ts` for the empirical reason
(prerendered banners froze at build time on spacefield.co, fixed in
session 2026-05-09 v7).

This means the `revalidate` constants we just added are currently
**inert at runtime** — every page is dynamic-rendered because of the
layout. The constants are still useful:

1. They declare the intended freshness window. The next dev who looks
   at `/legal/privacy` shouldn't wonder whether it's safe to cache.
2. They take effect immediately once the runtime-brand/runtime-banner
   readers are wrapped in `unstable_cache(..., { tags: [...] })`. That
   refactor is the natural next step — see section 3.

## 2. Single-flight stampede protection

`lib/cache/single-flight.ts` provides a `singleFlight(key, producer)`
wrapper that coalesces concurrent callers for the same key into one
in-flight Promise. Use it in front of:

- Hot RPCs called from admin dashboards (multiple widgets, one DB
  call).
- Layout helpers that fan out to several reads but each call could
  arrive concurrently from a burst of requests.
- Any read whose backend is the bottleneck and where N concurrent
  callers asking for the same value during a cache miss would compound
  the bottleneck.

Per-worker scope. Pair with a Map-with-TTL cache (see
`lib/runtime-banner.ts`) or `unstable_cache` for post-resolution
reuse. Single-flight protects the "I'm computing this right now"
window, not the steady-state read.

Failure semantics: producer rejection propagates to all awaiters; the
in-flight slot is cleared in `finally`, so we never cache errors.

## 3. `updateTag` on admin writes

Centralized tag names live in `lib/cache/single-flight.ts` as
`CACHE_TAGS`. Admin server actions that mutate runtime config now
import that constant and call `updateTag(...)` after the DB write
+ audit record.

We use `updateTag` rather than `revalidateTag` because the admin
mutations live inside server actions and we want read-your-own-writes
semantics for the immediate `revalidatePath` re-render (the admin
page reads the same data it just wrote). In Next 16, `revalidateTag`
requires a second `profile` argument (cache-life expiration) and is
intended for cross-request purge; `updateTag(tag)` is the
server-action-scoped variant.

Wired call sites:

| Admin action                              | Tag                          |
|-------------------------------------------|------------------------------|
| `app/admin/banners/_actions.ts` × 4 verbs | `banners`                    |
| `app/admin/branding/_actions.ts` × 3      | `brand.global` or `brand.workspace:<wsId>` |
| `app/admin/features/_actions.ts` × 4      | `feature-flags`              |
| `app/admin/maintenance/_actions.ts` × 3   | `maintenance`                |

Today these calls are effectively no-ops because the reader libs
(`lib/runtime-banner.ts`, `lib/runtime-brand.ts`, `lib/features.ts`)
hold values in a per-worker `Map` instead of `unstable_cache`. The
admin call sites are still the right place to wire the tags now, so
the next step — wrapping the readers — is a one-file change that
"just works" instead of "and also touch 14 admin action sites."

### Next step (not in this commit)

Wrap each reader. Sketch for `runtime-banner`:

```ts
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/single-flight";

const fetchActiveBanners = unstable_cache(
  async (uid, tier) => { /* the existing fetch */ },
  ["active-banners"],
  { revalidate: 30, tags: [CACHE_TAGS.banners] },
);
```

Then drop the `await headers()` workaround. Admin writes will
invalidate via the existing `updateTag(CACHE_TAGS.banners)` calls,
and the ISR constants in section 1 will start working.

## 4. Image audit

Scope: `/`, `/pricing`, `/changelog`, `/roadmap`, `/press`,
`/developers`, and the eight `/legal/*` pages.

**Result: zero plain `<img>` tags found** on these pages. They are
text + Tailwind + a couple of icon-mark SVGs served as raw asset
links. Nothing to convert.

The rest of the codebase has 17 files using `<img>`. Most should stay
as-is:

- `app/tools/property-poster-creator/*` — dynamic objectPosition/scale
  on a free-resize canvas. `next/image` strips orientation/EXIF in
  some configs (per session 2026-05-09 v7 memo), which would break
  rendered exports.
- `app/birthday/simren/{cinema,glass,magazine}/*` — explicit design
  spec forbids `<Image>` ("browsers honor iPhone EXIF; `<Image>` strips
  orientation").
- `app/(share)/{q,b,p}/[slug]/page.tsx`, `_components/FormRenderer.tsx`
  — `brandLogo` is an arbitrary user-supplied URL from Supabase
  Storage. Optimizing through `next/image` would require
  `remotePatterns` config in `next.config.ts`, which is out of scope
  for this task.
- `app/tools/_components/{ToolsShell,TopBar,MobileShell}.tsx` — avatar
  images, user-uploaded, dimensions are container-driven
  (`h-full w-full object-cover`).
- `app/solutions/tools/format-converters/_app.tsx` — QR code data URL.

If we later add Supabase Storage to `remotePatterns`, the
`(share)/*` brand logos become straight `next/image` swaps (known
`h-10 w-10`).

## 5. `Vary` headers

Audit only — middleware is out of scope for this change.

`app/middleware.ts` should set `Vary: Authorization, Accept-Language`
on responses that depend on session or locale, so any upstream CDN
keeps separate cache entries per dimension. Per-route handlers that
emit a `Cache-Control` should set the same `Vary`.

Current state: needs explicit verification in middleware. Add to the
checklist for the next middleware pass.

Specific surfaces to double-check when we touch middleware:

1. API routes under `/api/v1` — auth-token-keyed responses must vary
   on `Authorization` so a public CDN can't bleed one user's data
   into another's response.
2. Marketing pages with `Accept-Language` detection (we don't have
   one yet — but if added, vary on it).
3. The brand/banner data path — if/when wrapped in `unstable_cache`,
   confirm the cache key includes workspace id; `Vary` is the CDN-side
   protection, the cache key is the Next-side protection. We need
   both.
