# Git Hooks

## What runs and when

**`pre-push`** — runs `npm run build` before every `git push`.
Blocks pushes that would fail the Vercel deploy.

This mirrors what Vercel does in CI, catching errors like:
- Missing `<Suspense>` around `useSearchParams()`
- Missing required props
- Type errors that only surface during static prerender
- Broken imports

## Setup (automatic)

On `npm install`, the `postinstall` script runs:
```
git config core.hooksPath .githooks
```
That tells git to use these hooks instead of `.git/hooks/`.

## Bypass (emergency only)

```
git push --no-verify
```
Use only when you're certain the build passes but the hook is wrong
(e.g. network offline for node_modules). Generally: if the build fails
locally, it will fail on Vercel too.
