## Summary

<!-- One or two sentences. What does this PR do, and why? -->

## What changed

<!-- Bullet the concrete changes. File paths welcome. -->

-
-

## Risk + rollback plan

<!-- What could break? How do we revert if it does?
     e.g. "Revert this commit; no DB migration." or
          "Migration `2026_05_14_xxx` is additive — safe to leave; revert app code." -->

## Checklist

- [ ] `npx tsc --noEmit -p tsconfig.json` passes locally
- [ ] `pnpm lint` passes locally
- [ ] Tests added / updated where relevant
- [ ] Manually verified the change in the browser (or N/A — explain)
- [ ] `/admin/status` checklist updated if this closes a launch item
- [ ] No secrets, no `credentials/` paths, no `.env*` leaked
