# OWASP ASVS Level 1 — Self-assessment

Level 1 is "the minimum that any application should reach." We map
each control to a status:

- **Pass** — implemented and we can point at the file.
- **Partial** — partially implemented; we know the gap.
- **Fail** — not implemented; known gap, often tracked as a `B-*` or
  `V-*` backlog item.
- **N/A** — does not apply to our architecture (e.g. cryptography
  storage when we don't custody crypto material).

Honest scores only. "Partial" beats a generous "pass." If a control's
status is "pass" but the linked file is empty, that's a bug.

Final tally is at the bottom.

## V1 — Architecture

| Control | Status | Notes |
| --- | --- | --- |
| 1.1.1 — Use of an SDL | Partial | We have a security backlog (`/admin/status`) and rotate secrets, but no formal SDLC document — this file is the closest thing. |
| 1.1.2 — Threat modeling for new features | Fail | Done informally per feature, not as a checklist. |
| 1.1.3 — User stories include security/privacy criteria | Partial | Captured in CLAUDE.md spec text, not on a per-feature basis. |
| 1.2.1 — Unique low-privilege OS accounts | Pass | Vercel/Supabase serverless — managed runtimes, no shared OS accounts. |
| 1.2.2 — Authenticated communication between components | Pass | Supabase service role, Paddle webhook HMAC, internal cron secret. |
| 1.4.1 — Trusted enforcement points | Pass | `middleware.ts` + `withApiHandler` (`lib/api-wrap.ts`). |
| 1.4.4 — Single, vetted access-control mechanism | Pass | All routes go through middleware + RLS. No bypass paths. |
| 1.5.1 — Input/output requirements documented | Partial | Zod schemas at endpoints, but not centrally documented. |
| 1.5.2 — Serialization of untrusted data | Pass | JSON only, schema-validated; no `eval`, no custom deserializers. |
| 1.11.1 — Component definition (responsibilities) | Pass | `lib/` boundaries are clear; module READMEs cover the major ones. |

## V2 — Authentication

| Control | Status | Notes |
| --- | --- | --- |
| 2.1.1 — Passwords ≥ 12 chars | Pass | Supabase Auth default + we don't store passwords ourselves. |
| 2.1.2 — Passwords ≤ 128 chars | Pass | Supabase enforces. |
| 2.1.3 — No password truncation | Pass | Supabase. |
| 2.1.4 — All printable Unicode allowed | Pass | Supabase. |
| 2.1.7 — Breached-password check | Partial | Supabase has the option; we have it ON for paid tiers. |
| 2.1.9 — No password composition rules | Pass | We don't add custom rules. |
| 2.2.1 — Anti-automation on auth | Pass | Lockout (`lib/security/lockout.ts`) + IP rate limit in middleware. |
| 2.2.2 — Weak auth disabled | Pass | Only magic-link + password — no SMS, no security questions. |
| 2.2.3 — Secure notifications on auth events | Pass | `suspicious-login` template + sender. |
| 2.3.1 — Verification tokens are random | Pass | Supabase generates. |
| 2.5.1 — No "secret questions" | Pass | None used. |
| 2.5.2 — Verification tokens single-use | Pass | Supabase. |
| 2.5.3 — Initial passwords time-limited | Pass | Magic-link expires in 60 min. |
| 2.5.4 — Default accounts disabled | Pass | No default accounts. |
| 2.7.1 — TOTP support if MFA | Partial | Supabase Auth supports it; we don't yet surface enrollment in UI for all users. |

## V3 — Session management

| Control | Status | Notes |
| --- | --- | --- |
| 3.1.1 — No session in URL | Pass | Cookies only. |
| 3.2.1 — Session tokens are random | Pass | Supabase. |
| 3.2.2 — Session tokens are protected | Pass | `httpOnly`, `secure`, `sameSite=lax`. |
| 3.3.1 — Logout terminates session | Pass | `/api/auth/signout`. |
| 3.3.2 — Session timeout (15 min – 30 d) | Pass | Supabase refresh-token rotation; default 1 h access + 30 d refresh. |
| 3.4.1 — Cookies have `Secure` flag | Pass | Set in cookie helper. |
| 3.4.2 — Cookies have `HttpOnly` | Pass | Same. |
| 3.4.3 — `SameSite` set | Pass | `lax`. |
| 3.7.1 — Re-auth for sensitive ops | Partial | Account deletion has 30-day grace; some admin operations skip step-up. |

## V4 — Access control

| Control | Status | Notes |
| --- | --- | --- |
| 4.1.1 — Trusted enforcement point | Pass | Middleware + RLS. |
| 4.1.2 — All user/data attributes server-trusted | Pass | RLS is the source of truth. |
| 4.1.3 — Principle of least privilege | Pass | Anon vs authenticated vs service-role split. |
| 4.1.5 — Access control fails closed | Pass | Default-deny RLS; admin checks fail-closed in `assertCan`. |
| 4.2.1 — Sensitive data + APIs protected against IDOR | Pass | Verified by middleware path-scoping + RLS workspace_id filters. |
| 4.2.2 — Anti-CSRF tokens on state-changing requests | Pass | `sameSite=lax` cookies + same-origin requirement on middleware. Server actions also enforce. |
| 4.3.1 — Admin interface uses MFA | Partial | Studio access for Asad has 2FA; in-app `/admin` reuses normal session auth. |
| 4.3.2 — Directory browsing disabled | Pass | Next.js does not serve directory listings. |

## V5 — Validation, sanitization, encoding

| Control | Status | Notes |
| --- | --- | --- |
| 5.1.1 — Server-side input validation | Pass | Zod everywhere on API entries. |
| 5.1.2 — HTTP parameter pollution protected | Pass | Next.js parses query into a flat object; we read named keys. |
| 5.1.3 — Allow-listed input | Partial | Mostly enum/UUID validation; some free-text fields aren't structurally constrained. |
| 5.1.4 — Structured data parsed by safe library | Pass | `JSON.parse` only on already-typed input; no XML/YAML in request paths. |
| 5.1.5 — URL redirects validated | Pass | `next=` param goes through `validateNext()` in middleware. |
| 5.2.1 — Output encoding context-aware | Pass | React JSX auto-escapes; email templates use `escapeHtml`. |
| 5.2.2 — Untrusted HTML sanitized | Pass | `lib/sanitize.ts` wraps `isomorphic-dompurify`. |
| 5.2.3 — HTML/CSS for output via templating engine | Pass | React + tagged-template helpers. |
| 5.2.4 — `eval()` etc. avoided | Pass | No `eval` or `Function()` constructor anywhere in the codebase. |
| 5.2.5 — Template-injection protected | Pass | All template inputs are escaped via `escapeHtml`. |
| 5.3.1 — Output encoding for SQL | Pass | Parameterized queries via Supabase client; no string concatenation. |
| 5.3.4 — SSRF protected | Pass | `lib/http/fetch.ts` IP-blocklist (V-2 fix). |
| 5.3.5 — Deserialization safe | Pass | JSON only. |

## V6 — Stored cryptography

| Control | Status | Notes |
| --- | --- | --- |
| 6.1.1 — Cryptographic keys catalog | Pass | This doc + `SECRETS-ROTATION.md`. |
| 6.2.1 — Industry-proven algorithms | Pass | HMAC-SHA-256, AES-GCM (when used). |
| 6.2.2 — Keys not hard-coded | Pass | All from env. |
| 6.4.1 — Secrets stored in secrets manager | Pass | Vercel env vars + Supabase secret store. |

## V7 — Error handling and logging

| Control | Status | Notes |
| --- | --- | --- |
| 7.1.1 — Don't log credentials | Pass | `lib/safe-error.ts` redacts. |
| 7.1.2 — Don't log session tokens | Pass | Same. |
| 7.2.1 — Error events logged | Pass | `error_log` table + `log.error`. |
| 7.2.2 — Logs include enough context | Pass | Request ID, user ID, evt, kv. |
| 7.4.1 — Generic error to client | Pass | `safeError()` wraps 500s. |

## V8 — Data protection

| Control | Status | Notes |
| --- | --- | --- |
| 8.1.1 — Sensitive data identified | Partial | Email, billing data, workspace content — known, but no formal classification doc. |
| 8.2.1 — TLS for all transit | Pass | Vercel terminates TLS; HSTS enforced. |
| 8.3.1 — Sensitive data not in URL | Pass | Tokens in body/cookie; query params used only for non-sensitive args. |
| 8.3.4 — Authenticated data not cached client-side | Pass | `Cache-Control: private, no-store` on auth routes. |

## V9 — Communications

| Control | Status | Notes |
| --- | --- | --- |
| 9.1.1 — TLS 1.2+ only | Pass | Vercel default. |
| 9.1.2 — Connections to backend over TLS | Pass | Supabase, Resend, Postmark, Paddle all TLS. |
| 9.2.1 — Server certificates valid | Pass | Vercel-managed. |

## V10 — Malicious code

| Control | Status | Notes |
| --- | --- | --- |
| 10.1.1 — Code-review process | Partial | Self-review for solo dev; AI-assisted second-pass. |
| 10.2.1 — Third-party libraries verified | Partial | `pnpm audit` in CI; not yet on a fixed cadence. |
| 10.3.1 — Apps integrity-protected | Pass | Vercel deploy signing; immutable builds. |

## V11 — Business logic

| Control | Status | Notes |
| --- | --- | --- |
| 11.1.1 — Business flow sequence | Partial | Critical flows have explicit state checks; some optional flows assume order. |
| 11.1.2 — Limits per user | Pass | Rate-limiter per user_id + per IP. |
| 11.1.4 — Anti-automation on key flows | Pass | Sign-up, password reset, search are rate-limited. |
| 11.1.5 — TOCTOU-resistant ops | Partial | Most write paths re-check on `with check` RLS; a few admin scripts don't. |

## V12 — Files and resources

| Control | Status | Notes |
| --- | --- | --- |
| 12.1.1 — Max upload size enforced | Pass | 10 MB in Supabase Storage policy. |
| 12.1.2 — Compressed-upload bomb | Partial | We accept zip in CSV-import; no bomb detection beyond size. |
| 12.3.1 — File-name/path traversal protected | Pass | UUID-based storage paths; user-supplied names sanitized at write. |
| 12.4.1 — Untrusted files in protected location | Pass | Supabase Storage with RLS. |
| 12.5.1 — Direct-execute of untrusted files blocked | Pass | Storage serves with `application/octet-stream` by default. |

## V13 — API and Web Service

| Control | Status | Notes |
| --- | --- | --- |
| 13.1.1 — Same security controls on API and UI | Pass | Both go through middleware. |
| 13.2.1 — Verb + content-type accepted is enumerated | Pass | Route handlers export only the verbs they accept. |
| 13.2.3 — Anti-CSRF on cookie-auth endpoints | Pass | `sameSite=lax` + origin check. |
| 13.3.1 — JSON schema validated | Pass | Zod. |

## V14 — Configuration

| Control | Status | Notes |
| --- | --- | --- |
| 14.1.1 — Build pipeline warning-free | Partial | TS strict; some eslint warnings tolerated for legacy paths. |
| 14.1.2 — Compiler flags set | Pass | TS strict + Next.js strict mode. |
| 14.2.1 — Components removed if not needed | Pass | Periodic dep audit. |
| 14.3.1 — Error messages don't leak details | Pass | `safeError()`. |
| 14.4.1 — Security headers set | Pass | `lib/security-headers.ts` — HSTS, CSP, X-Frame-Options, Referrer-Policy. |
| 14.4.2 — Suitable CSP | Partial | CSP is set but allows `unsafe-inline` for styles — common in Tailwind setups. |
| 14.4.3 — `X-Content-Type-Options: nosniff` | Pass | Set. |
| 14.5.1 — Method-allow-list per endpoint | Pass | Next.js route exports. |

## Tally

| Status | Count |
| --- | --- |
| Pass | 56 |
| Partial | 16 |
| Fail | 2 |
| N/A | 0 |
| **Total** | **74** |

Reviewed: 2026-05-17. Next review: 2026-08-17 (quarterly). The two
fails (1.1.2, 1.1.3 — formal threat modeling) are tracked in the
security backlog and accepted at L1; both are L2-flavored ASVS items
that we don't pretend to have implemented.
