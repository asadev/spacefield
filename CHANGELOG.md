# Changelog

## Unreleased

### DevOps

- DAST: nightly OWASP ZAP baseline + on-demand full scan workflow
  (`.github/workflows/dast.yml`). Soft-gated until rules are tuned.
- Coverage: vitest line-coverage gate scoped to `lib/` with a 60%
  threshold (`.github/workflows/coverage.yml`). Soft-warn for the
  initial backfill window.
- Migration CI: spins up `postgres:16`, applies every migration in
  order, then re-applies to assert idempotency
  (`.github/workflows/migration-ci.yml`).
- Release notes: tag-triggered CHANGELOG update + GitHub Release
  publish, pure shell, no external deps
  (`.github/workflows/release-notes.yml`).
- A11y CI: `@axe-core/cli` against `/`, `/pricing`, `/compare`,
  `/developers` on every PR, soft-warn
  (`.github/workflows/a11y.yml`).
- Settings backup: `scripts/backup-settings.ts` exports admin config
  rows to JSON (workspaces, runtime_config, admin_pages, admin_roles,
  feature_flags). Docs at `docs/ops/SETTINGS-BACKUP.md`.
- Branch protection procedure documented at
  `docs/devops/BRANCH-PROTECTION.md` — applied manually via the GitHub
  UI on `main`.
