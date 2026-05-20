# QA-F: API + webhooks + embed — findings

**Branch:** `qa-qa-f-api`
**Scope:** Public REST `/api/v1/*`, `/developers`, `/embed/*`, all `/api/cron/*`, Paddle + inbound webhooks, outgoing webhook dispatcher, `/api/health`, `/api/auth/check-lockout`, `/api/security/csp-report`, `/.well-known/security.txt`.
**Mode:** READ-ONLY. ~40 file reads. No WebFetch performed (every issue was determinable from source alone — saves the budget for the next QA agent).

---

## Personas walked

| # | Persona                  | Result        |
|---|--------------------------|---------------|
| 1 | Third-party API consumer | walked end-to-end; ❌ 5, ⚠️ 3 |
| 2 | Webhook subscriber       | walked end-to-end; ❌ 3, ⚠️ 1 |
| 3 | Embed integrator         | walked end-to-end; ❌ 3, ⚠️ 1 |

---

## ✅ Working

- **Bearer-token auth + scope gate** — `authenticateV1()` in `app/api/v1/_lib/auth.ts:64-101` is clean: `Authorization: Bearer …` extracted case-insensitively, token validated through `api_token_lookup` RPC (filters expired/revoked), required scope checked, `workspace_id` required. 401 carries proper `WWW-Authenticate: Bearer realm="api"`. Error body shape is stable (`{ error, detail? }`).
- **Cursor pagination shape is consistent** — every list endpoint over-fetches by 1 and emits `{ data, next_cursor }` via `buildListResponse`. Limit is clamped to [1, 100], default 50.
- **Workspace scoping is correctly enforced** — every v1 query carries `.eq("workspace_id", ctx.workspaceId)`. By-id endpoints use `maybeSingle()` + 404 (no cross-workspace existence oracle).
- **CSP report sink is hardened** — `app/api/security/csp-report/route.ts` rate-limits 30/min per IP, caps body at 16 KB, soft-validates shape, always 204s (no oracle). Edge runtime. ✅
- **Outgoing webhook signing is correctly centralised** — `lib/webhooks/sign.ts:95` calls `signHmacSha256` from `@/lib/hmac`, emits `X-Signature: sha256=…`, `X-Timestamp`, `X-Event`. **W2 wiring confirmed.**
- **Outgoing webhook retry + dead-letter** — `lib/webhooks/retry.ts` has exp-backoff `[1s, 4s, 16s, 64s]`, retries 5xx/408/429/timeout/network-error, terminates with `status='exhausted'` row after max attempts. Async mode persists `next_attempt_at`. ✅
- **Inbound webhook supports `?token=` fallback** — `app/api/inbound/webhook/[slug]/route.ts:60-73` accepts header OR query token with timing-safe compare. **SC-006 partial expected → confirmed.**
- **Legacy `xlsx` import is gone** — `grep -rn 'from "xlsx"'` returns zero matches. `package.json:85` only ships `exceljs`. **SE-002 confirmed.**
- **`/api/health` no longer leaks commit/region by default** — `commit`/`region`/`detail` only emitted when `?deep=1` + `Authorization: Bearer $HEALTH_DEEP_TOKEN` (or `CRON_SECRET`) — verified with constant-time `safeEq`. **SD-007 confirmed.**
- **Paddle webhook is idempotent** — primary dedup via `paddle_webhook_events` UNIQUE (`event_id`), defence-in-depth via `withIdempotency("paddle:<event_id>")`. Replays return 200 without re-dispatching.
- **`/.well-known/security.txt`** — present at `public/.well-known/security.txt`, RFC 9116 fields populated (Contact, Expires, Canonical, Policy, Preferred-Languages, Acknowledgments). Expires 2027-05-13 (within RFC 1-year rule).
- **`/api/auth/check-lockout` doesn't leak account existence** — returns `{locked,until}` regardless of whether the email exists. Failure path is fail-open. No oracle.
- **Embed CSP carve-out** — `lib/security-headers.ts:103-111` `isEmbedPath()` correctly matches `/embed/*` and toShare viewer prefixes; drops `X-Frame-Options` + `frame-ancestors` for those responses. **SE-008 confirmed for the embed namespace.**

---

## ⚠️ Minor

- **OpenAPI spec is `force-static`** — `app/developers/openapi.json/route.ts:3` exports `dynamic = "force-static"`. Combined with `Cache-Control: public, max-age=300` it'll serve stale specs through CDN edge cache for 5 min after a deploy. Acceptable, but worth noting — if you ship breaking changes, give the cache 5 min to invalidate.
- **Embed page is `force-static` with `dynamic = "force-static"`** — `app/embed/[toolId]/page.tsx:22`. Together with `generateStaticParams()` returning all widget IDs, this is correct for SSG. But when a new widget is added, **the page won't render until the next deploy** (no ISR). Mention in the docs.
- **`Powered by Spacefield` footer link in embed has `target="_blank"`** — `app/embed/layout.tsx:43-50` uses `rel="noopener noreferrer"` (good). But on a customer-iframe context, opening a new tab from inside the iframe may be blocked by the parent's `allow-popups` sandbox attr. Document the recommended iframe `sandbox=` allowlist on /developers.
- **Inbound webhook accepts `?token=` in URL bar** — leaks into request logs, browser history, and Referer headers if the receiving page ever sets one. Header path is preferred; the docs at `/admin/webhooks` should warn about `?token=` ending up in CDN access logs.
- **Embed widgets pull no analytics** — good for performance, but means we have **zero visibility** into embed adoption. Add a fire-and-forget pixel POST (no PII) to `/api/embed/beacon` if you want to measure widget usage on customer sites.

---

## ❌ Bugs (per persona)

### Persona 1 — Third-party developer

**P-1.1 (P0) — Paddle webhook still uses inline verifier, not `lib/paddle-verify.ts`.**
`app/api/paddle/webhook/route.ts:100-114` defines its own `verifyPaddleSignature()` with its own `parsePaddleSignature` and `timingSafeEqualHex` rather than importing from `@/lib/paddle-verify`. The two implementations are subtly different — the inline one accepts non-integer `ts` values (only `Number.isFinite`), while `lib/paddle-verify.ts:83-85` additionally requires `Number.isInteger` and `tsNum > 0`. Drift between two HMAC verifiers is exactly the kind of thing that ships a CVE 18 months from now. **Checklist `webhook-sig-incoming` is correctly marked "partial" in `app/admin/status/_checklist.ts:408` — finish the swap.** scan-sb-003 follow-up is NOT done.

**P-1.2 (P1) — `admin:write` wildcard scope is undocumented but bypasses every scope check.**
`lib/api-tokens/verify.ts:49-50` grants any v1 endpoint to any token carrying `admin:write`. `/developers` page only lists `read:tasks…read:all`. An admin who mints a token with `admin:write` for management-API use will, without realizing it, also be handing a full read API key to whoever holds that token. Either document it on the public docs page **or** scope-split — public v1 endpoints should only honour `read:*` family scopes.

**P-1.3 (P1) — Rate-limit advertised as "per token" but is keyed by IP.**
`app/developers/page.tsx:215` and `app/developers/openapi.json/route.ts:63` both say "600 req/min per token". But `lib/api-wrap.ts:128` builds the bucket key as `${userId ?? ip}:${opts.source}` — and v1 endpoints never set `userId` on `withApiHandler` (that field is only populated by the `requireAdmin` branch on line 113). Net effect: every v1 endpoint is bucketed by IP, NOT per-token. Two tokens from the same office NAT share a bucket; a token used from many IPs gets no aggregation. Either:
- Refactor `withApiHandler` to accept a key resolver, or
- Have v1 routes do their own rate-limit after `authenticateV1()` returns (then it can key off `ctx.tokenId`).

**P-1.4 (P1) — Browser-side use of the public API is impossible (no CORS headers).**
No `Access-Control-Allow-Origin` on any of the 7 v1 routes. Combined with the cookie-only middleware default, any browser-side fetch from a customer page is blocked. **Either** advertise this clearly on /developers ("server-side use only — set up a proxy for browser apps") **or** allow `Origin: *` since the auth is bearer-token (not cookie), and emit `Access-Control-Allow-Methods: GET`, `Access-Control-Allow-Headers: Authorization`. Today the docs (`app/developers/page.tsx`) say nothing either way.

**P-1.5 (P2) — `/api/v1/{contacts,deals,employees}` have no by-id endpoint, but the developer docs imply they do.**
`app/developers/page.tsx:166-176` lists `404 — entity not in your workspace` as a top-level response. Only `tasks` and `projects` actually expose a `{id}` route in `app/api/v1/`. Either add the missing 3 by-id handlers (consistent surface) or remove the 404 description from the docs and add a note.

**P-1.6 (P2) — Soft-deleted CRM rows leak through `/api/v1/contacts` and `/api/v1/deals`.**
`crm_contacts` and `crm_deals` both have a `deleted_at` column (added in `supabase/migrations/20260514b_database_hardening.sql`). `app/api/v1/contacts/route.ts:37-41` and `app/api/v1/deals/route.ts:37-42` do NOT filter `.is("deleted_at", null)` — yet `tasks` and `projects` do. Inconsistent and means tombstoned records still get served via the public API.

**P-1.7 (P2) — `q` query param on `/api/v1/contacts` allows unescaped LIKE patterns.**
`app/api/v1/contacts/route.ts:44` interpolates the user-supplied `q` directly into ilike: `query.ilike("email", "%${q}%")`. Supabase JS will parametrize the value but does not escape `%` / `\` inside ilike. `?q=%` matches everything (effectively bypasses any pagination filter intent). Also no length cap on `q` — `?q=<10000 chars>` produces a heavy regex on every row. Sanitize: reject `q` longer than 64 chars and either escape `\` `%` `_` or limit the filter to prefix-only.

**P-1.8 (P2) — Docs example shows `sf_xxxxx…` token prefix that doesn't exist.**
`app/developers/page.tsx:159` shows `Authorization: Bearer sf_xxxxxxxxxxxxxxxx`. But `lib/api-tokens/index.ts:60` generates tokens with `randomBytes(32).toString("hex")` — pure 64-char hex, no `sf_` prefix. A developer who hard-codes "must start with sf_" in their validator will get burned.

**P-1.9 (P2) — Rate-limit responses don't carry `X-RateLimit-*` headers.**
`lib/api-wrap.ts:144-156` returns 429 with only `Retry-After`. Modern clients expect `X-RateLimit-Limit`/`X-RateLimit-Remaining`/`X-RateLimit-Reset` (or the IETF draft `RateLimit` header). Emit them on every response (not just 429) so clients can proactively throttle.

### Persona 2 — Webhook subscriber

**P-2.1 (P0) — 14 of 15 cron endpoints use plain `===` string compare on the bearer secret.**
Only `app/api/cron/social-publish/route.ts` uses `timingSafeEqual`. The other 14 — `account-purge`, `audit-purge`, `ai-batch-runner`, `anomaly-check`, `api-token-reminder`, `log-retention`, `outbox-relay`, `paddle-retention`, `partition-rotator`, `refresh-matviews`, `slow-queries-snapshot`, `stuck-jobs-detect`, `suspicious-login-scan`, `workspace-purge` — all do `if (auth === "Bearer ${secret}") return true`. Timing-attack window is small over HTTPS but not zero, especially from a same-region attacker. **SD-008 fix is incomplete — only one cron was actually converted.** Factor the auth check into a single `lib/cron-auth.ts::isAuthorizedCronCall(req)` and replace all 15 copies.

**P-2.2 (P0) — Cron auth fails OPEN when `CRON_SECRET` env is unset.**
Every cron route does `if (secret) { … check bearer … }` and then falls through to checking the user-agent. The `vercel-cron` UA is spoofable by anyone — Vercel does not strip the `User-Agent` header from inbound traffic, only the `x-vercel-cron` header. Misconfigured prod (no `CRON_SECRET` set) → any caller setting `User-Agent: vercel-cron/1.0` triggers `hard_delete_expired_accounts` or `workspace-purge`. Refactor to **fail closed** when `CRON_SECRET` is unset.

**P-2.3 (P1) — `/api/inbound/webhook/[slug]` has no rate-limit.**
`app/api/inbound/webhook/[slug]/route.ts` is public, CORS-open POST. A bad-signature attacker can hammer signature attempts indefinitely. `app/api/inbound/form/[slug]/route.ts:17` imports `checkRateLimit` — apply the same pattern to the webhook variant. Bad-sig responses should also be rate-limited (otherwise an attacker can use the endpoint as an oracle on whether a slug exists, since unknown-slug = 404 vs bad-sig = 400).

**P-2.4 (P2) — `/api/auth/check-lockout` claims to be rate-limited in its docstring but is not.**
`app/api/auth/check-lockout/route.ts:18-20` says "Routing through our own server endpoint lets us rate-limit and shape the response." There is no rate-limit. A spammer can hammer the endpoint with random emails. Today it doesn't leak existence (always returns `{locked:false}` for unknown emails because `getLockoutState` returns the same shape) — but if anyone wires the failure path differently later, the lack of rate-limit becomes the exploit. Add `checkRateLimit(req, "auth.check-lockout", { count: 30, window_sec: 60 })`.

### Persona 3 — Embed integrator

**P-3.1 (P1) — Embed widgets are light-mode-locked despite the comment claiming dark-mode support.**
`app/embed/layout.tsx:25-34` hardcodes `backgroundColor: "#ffffff"`, `color: "#0f172a"`. `app/embed/_components/MortgageWidget.tsx:54-64` hardcodes `background: "#ffffff"` for inputs and `color: "#0f172a"` for text. There is **no media-query for `prefers-color-scheme: dark`** and no parent-frame detection. If a customer's site is dark-themed, the embed will look like a white rectangle in the middle of a black page. The task brief asks "Does it work in dark + light mode?" — answer is "light only". Either honour `prefers-color-scheme: dark` via inline `<style>` or accept a `?theme=dark` query param.

**P-3.2 (P1) — `Permissions-Policy` header blocks `payment` and `usb` site-wide, including on embed paths.**
`lib/security-headers.ts:35-45` sets `Permissions-Policy: payment=(), usb=(), …` on every response, no embed carve-out. If a future embed needs `PaymentRequest` (e.g. a price-calculator that lets the visitor purchase), the policy will silently block it. Today it's fine, but document that embed widgets MUST NOT use `payment`/`usb`/`microphone`/`camera` APIs.

**P-3.3 (P2) — Embed page has `dynamic = "force-static"` but uses a client component — bundle includes React.**
`app/embed/[toolId]/page.tsx:22` declares `force-static`, then renders a `"use client"` component (`MortgageWidget.tsx:1`). Net bundle for a 200-line calculator is ~80KB of React hydration code. For customer iframe contexts, ideally these should be vanilla-JS or at minimum islands — but at the very minimum, the embed bundle should be code-split from the main app bundle so a customer's slow connection doesn't download the unused 600+ component tree. Verify with `npm run build -- --analyze`.

**P-3.4 (P2) — Embed `/embed` (no toolId) returns 404 silently with no helpful body.**
`app/embed/[toolId]/page.tsx:55` calls `notFound()` for unknown widget IDs. A customer who pastes the wrong URL gets the default Next 404 page (which still has Spacefield chrome). For an iframe context, this is jarring — render a small "Widget not available" message inside the embed shell instead.

**P-3.5 (P2) — `robots: { index: false, follow: false }` is set in metadata, but the page is `force-static` → robots can still see it if they crawl HTML directly.**
`app/embed/layout.tsx:19` and `app/embed/[toolId]/page.tsx:47` both set `index:false`. But the static prerender means the HTML is publicly fetchable. Consider also returning `X-Robots-Tag: noindex` from middleware for `/embed/*` so HTTP-only crawlers (which don't parse `<meta>`) also stay out.

---

## Cron-secret coverage audit

| Cron endpoint | Bearer check | Timing-safe? | Fails closed on missing CRON_SECRET? |
|---|---|---|---|
| `account-purge` | `===` | ❌ | ❌ |
| `ai-batch-runner` | `===` | ❌ | ❌ |
| `anomaly-check` | `===` | ❌ | ❌ |
| `api-token-reminder` | `===` | ❌ | ❌ |
| `audit-purge` | `===` | ❌ | ❌ |
| `log-retention` | `===` | ❌ | ❌ |
| `outbox-relay` | `===` | ❌ | ❌ |
| `paddle-retention` | `===` | ❌ | ❌ |
| `partition-rotator` | `===` | ❌ | ❌ |
| `refresh-matviews` | `===` | ❌ | ❌ |
| `slow-queries-snapshot` | `===` | ❌ | ❌ |
| **`social-publish`** | `timingSafeEqual` | ✅ | ❌ (still falls through to UA) |
| `stuck-jobs-detect` | `===` | ❌ | ❌ |
| `suspicious-login-scan` | `===` | ❌ | ❌ |
| `workspace-purge` | `===` | ❌ | ❌ |

**Verdict:** SD-008 fix is **1/15 done** — only `social-publish` was updated. Every other cron remains timing-attack-vulnerable and fails open when `CRON_SECRET` is unset.

---

## Webhook signing audit (Paddle inbound + outgoing dispatcher)

### Paddle inbound (`/api/paddle/webhook`)
- ✅ HMAC-SHA256 over `${ts}:${rawBody}` — matches Paddle spec.
- ✅ 5-minute replay window via `SKEW_TOLERANCE_SECONDS`.
- ✅ Constant-time `crypto.timingSafeEqual` on hex.
- ✅ Length-mismatch short-circuit (avoids timingSafeEqual throw).
- ✅ Idempotency: primary via `paddle_webhook_events` unique row + defence-in-depth via `withIdempotency`.
- ❌ Uses **inline** verifier — does not import `lib/paddle-verify.ts` (the canonical impl that ships stricter ts integer validation). **scan-sb-003 follow-up incomplete.**

### Outgoing dispatcher (`/admin/webhooks` → `lib/webhooks/sign.ts` → `lib/webhooks/retry.ts`)
- ✅ Signs via `signHmacSha256` from `@/lib/hmac` (single source of truth).
- ✅ Emits `X-Signature: sha256=<hex>`, `X-Timestamp`, `X-Event` — receivers can verify + enforce replay window.
- ✅ Body is `JSON.stringify({ event, timestamp, ...input.body })` — deterministic.
- ✅ Retries on 5xx/408/429/timeout/network-error with 1s/4s/16s/64s exp backoff.
- ✅ Final status `exhausted` + `delivery_group` UUID linking attempts in `webhook_deliveries_v2`.
- ✅ Async mode persists `next_attempt_at` for worker pickup.
- ⚠️ `lib/webhooks/sign.ts:84` adds `timestamp: new Date().toISOString()` (ISO) **inside the body**, while `X-Timestamp` is unix-seconds. Two different timestamp formats in two different places — easy footgun if a receiver checks the wrong one for replay. Suggest documenting which is canonical for replay-window enforcement, OR emit both as ISO.
- ⚠️ No per-endpoint signing-secret rotation surface — once a customer's receiver leaks the secret, rotating it without breaking the connection is a manual DB edit.

---

## OpenAPI conformance audit

- ✅ `openapi: "3.1.0"`, `info`, `paths`, `components/securitySchemes`, `components/schemas` all present.
- ✅ Bearer-auth scheme correctly typed `http`/`bearer`.
- ✅ Type-union nullables use the OpenAPI 3.1 syntax (`type: ["string", "null"]`) — valid only on 3.1+, would have broken validators expecting 3.0. Good.
- ✅ Every operation declares `security`, `parameters`, `responses` (including 401/403/429 from `ERROR_RESPONSES`).
- ⚠️ The spec advertises `/api/v1/tasks/{id}` and `/api/v1/projects/{id}` but does NOT advertise `/api/v1/contacts/{id}`, `/api/v1/deals/{id}`, `/api/v1/employees/{id}` — consistent with the actual route handlers, but the developer docs page **assumes** they exist. Pick one direction (add the endpoints, or document the missing surface).
- ⚠️ `servers` array hard-codes `https://spacefield.co` — a generated client run against a preview URL (`https://*-preview.vercel.app`) will issue requests against prod. Add a second `servers[]` entry for preview, or make it dynamic from `VERCEL_URL`.
- ❌ No `x-rateLimit` or `x-ratelimit-policy` extension declared, so generated clients have no way to wire retry-on-429 logic from the spec alone.
- ❌ No examples blocks (`examples: {}`) — the in-page curl snippets exist on `/developers` but the OpenAPI consumer (e.g. ReDoc, Stoplight) sees no examples.

---

## Suggested checklist additions

1. **`cron-secret-timing-safe-everywhere`** — P0, S — Apply `lib/cron-auth.ts::isAuthorizedCronCall` (factored out from `social-publish/route.ts`) to all 14 remaining cron routes. Fail closed when `CRON_SECRET` is unset.
2. **`paddle-verify-swap-to-lib`** — P0, XS — Delete inline `verifyPaddleSignature` from `app/api/paddle/webhook/route.ts:100-114`, import from `@/lib/paddle-verify`. Closes the partial `webhook-sig-incoming`.
3. **`v1-rate-limit-key-on-token-id`** — P1, S — Either refactor `withApiHandler` to take a key resolver, or move v1 rate-limit logic post-`authenticateV1()` so the bucket key is `ctx.tokenId`, matching the public docs claim.
4. **`v1-cors-policy-or-docs-warning`** — P1, XS — Pick a stance: either emit `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Methods: GET` + `Access-Control-Allow-Headers: Authorization` on v1 endpoints (bearer-token, no cookies → safe), or document "server-side use only" prominently on `/developers`.
5. **`v1-soft-delete-filter-crm`** — P2, XS — Add `.is("deleted_at", null)` to `app/api/v1/contacts/route.ts` and `app/api/v1/deals/route.ts` for parity with tasks/projects.
6. **`v1-ilike-q-sanitize`** — P2, XS — Reject `q` longer than 64 chars; escape `%`/`\`/`_` before interpolation in `app/api/v1/contacts/route.ts:44`.
7. **`v1-contacts-deals-employees-by-id`** — P2, M — Add `/api/v1/{contacts,deals,employees}/[id]` handlers to match the developer-docs implication of a uniform CRUD-shaped read surface.
8. **`v1-rate-limit-headers`** — P2, XS — Emit `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (or `X-RateLimit-*`) on every v1 response, not just 429.
9. **`v1-admin-write-scope-policy`** — P1, XS — Decide: either document `admin:write` as a wildcard on `/developers`, or scope-split (admin tokens should NOT auto-grant public v1).
10. **`inbound-webhook-rate-limit`** — P1, XS — Add `checkRateLimit` to `app/api/inbound/webhook/[slug]/route.ts` to throttle bad-sig probes.
11. **`auth-check-lockout-rate-limit`** — P2, XS — Add rate-limit to `app/api/auth/check-lockout/route.ts` (docstring already implies one exists).
12. **`embed-dark-mode-or-theme-param`** — P1, S — Either honour `prefers-color-scheme: dark` in `app/embed/layout.tsx` + widget components, or accept `?theme=dark|light` query param.
13. **`embed-x-robots-tag`** — P2, XS — Emit `X-Robots-Tag: noindex, nofollow` from middleware for `/embed/*` paths.
14. **`webhook-outgoing-secret-rotation-ui`** — P2, M — Add a "rotate secret" button to `/admin/webhooks/[id]` with a grace window where both old and new secrets verify (prevents customer-receiver downtime).
15. **`webhook-outgoing-timestamp-format-doc`** — P2, XS — Document which of `X-Timestamp` (unix seconds) vs body `.timestamp` (ISO) is canonical for replay-window enforcement, in `/admin/webhooks` settings UI.
16. **`openapi-servers-dynamic`** — P2, XS — Add a second `servers[]` entry to the OpenAPI spec, populated from `process.env.VERCEL_URL`, so previews don't generate clients that hit prod.

---

## Bonus — files referenced in this audit (absolute paths)

- `/Users/apple/Projects/spacefield-qa-f-api/app/api/v1/_lib/auth.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/v1/{tasks,projects,contacts,deals,employees}/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/v1/{tasks,projects}/[id]/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/developers/page.tsx`
- `/Users/apple/Projects/spacefield-qa-f-api/app/developers/openapi.json/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/health/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/paddle/webhook/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/inbound/webhook/[slug]/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/security/csp-report/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/auth/check-lockout/route.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/app/embed/layout.tsx`
- `/Users/apple/Projects/spacefield-qa-f-api/app/embed/[toolId]/page.tsx`
- `/Users/apple/Projects/spacefield-qa-f-api/app/embed/_components/{MortgageWidget,RoiWidget}.tsx`
- `/Users/apple/Projects/spacefield-qa-f-api/lib/api-wrap.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/lib/api-tokens/{index,verify}.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/lib/paddle-verify.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/lib/webhooks/{sign,retry}.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/lib/security-headers.ts`
- `/Users/apple/Projects/spacefield-qa-f-api/public/.well-known/security.txt`
- `/Users/apple/Projects/spacefield-qa-f-api/vercel.json`
- `/Users/apple/Projects/spacefield-qa-f-api/app/api/cron/*/route.ts` (×15)
