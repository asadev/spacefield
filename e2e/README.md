# e2e/

Playwright smoke pack. Five non-destructive checks that verify the
public surface still serves traffic after a deploy.

## Running

Playwright is opt-in (see `playwright.config.ts`). Install once:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

Then either:

```bash
# Local — boots `pnpm dev` for you
pnpm test:e2e

# Against a deployed URL (e.g. a Vercel preview)
PLAYWRIGHT_BASE_URL=https://spacefield-pr-123.vercel.app pnpm test:e2e
```

## What's covered

| Spec                  | Asserts                                                        |
| --------------------- | -------------------------------------------------------------- |
| `homepage.spec.ts`    | `/` returns 200, primary nav links are present                 |
| `pricing.spec.ts`     | `/pricing` returns 200, currency switcher (`<select>`) renders |
| `signin.spec.ts`      | `/signin` renders the sign-in dialog                           |
| `tasks.spec.ts`       | `/tasks` returns 200 with the unauthenticated-fallback state   |
| `health.spec.ts`      | `GET /api/health` returns JSON `{ ok, status, probes }`        |

These are deliberately read-only; the harness never signs in, never
writes to the database, never invokes the AI provider.
