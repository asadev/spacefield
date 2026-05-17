# tests/

Vitest unit tests for pure-ish helpers under `lib/`.

## Running

Vitest isn't a project dependency to keep the install lean. Install
it locally when you want to run the suite:

```bash
pnpm add -D vitest @vitest/coverage-v8
pnpm test          # one-shot
pnpm test -- --ui  # interactive
```

The `test` script in `package.json` no-ops with a helpful message
when vitest isn't installed, so CI doesn't fail just because the dep
is absent.

## What's covered

| File                       | Helpers exercised                                       |
| -------------------------- | ------------------------------------------------------- |
| `escape-helpers.test.ts`   | `escapeForLike`, `escapeForOr`, `escapeCsvCell`         |
| `safe-href.test.ts`        | `isSafeScheme`, `safeHref`                              |
| `hmac.test.ts`             | `signHmacSha256`, `verifyHmacSha256`                    |
| `locale-format.test.ts`    | `formatDate`, `formatNumber`, `formatCurrency`          |
| `safe-error.test.ts`       | `safeErrorMessage` prod vs dev branching                |

These were picked because they're pure, security-relevant, and run
without a Supabase / fetch mock. Anything that touches the database,
the AI provider, or `next/headers` is e2e territory.
