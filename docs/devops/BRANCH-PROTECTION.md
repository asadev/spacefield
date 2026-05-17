# Branch protection — main

Branch protection on `main` is configured via the GitHub UI (not via
`.github/`). This doc is the procedure so we can re-apply it
identically if the rules drift or the repo moves.

Apply at: **Settings → Branches → Branch protection rules → Add rule**
(or edit existing rule for `main`).

## Required settings

### Pattern

- Branch name pattern: `main`

### Pull request requirements

- [x] Require a pull request before merging
- [x] Require approvals (1 — bump to 2 once the team grows)
- [x] Dismiss stale pull request approvals when new commits are pushed
- [ ] Require review from Code Owners (enable when CODEOWNERS exists)

### Status checks

- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- [x] Required checks (search and add each by name):
  - `Bundle budget` (from `Test`)
  - `Vitest (unit)` (from `Test`)
  - `Lighthouse` (from `Lighthouse` workflow)
  - `CodeQL` (from `SAST`)
  - `License check` (from `License check`)
  - `Secret scan` (from `Secret scan`)
  - `SBOM` (from `SBOM`)
  - `Audit` (from `Audit`)
  - `Migration CI / Apply + re-apply (idempotency)` (only required
    when migrations change — leave optional otherwise)
  - `Coverage gate / Vitest coverage (lib/)` — leave as a check but
    don't mark required until the gate is hard-enforced
  - `DAST (OWASP ZAP) / ZAP baseline (soft)` — not required; signal-only
  - `A11y (axe) / axe-core scan` — not required; signal-only

### Linear history

- [x] Require linear history (use squash or rebase merges; no merge
      commits)

### Force-push / deletion

- [x] Do not allow bypassing the above settings (admins included)
- [x] Restrict who can push to matching branches → empty list (no
      direct pushes; PRs only)
- [ ] Allow force pushes → **disabled**
- [ ] Allow deletions → **disabled**

### Conversation resolution

- [x] Require conversation resolution before merging

### Signed commits

- [ ] Require signed commits — leave off until everyone has GPG
      configured; revisit when CODEOWNERS lands

## Verifying the rules

After saving:

```bash
gh api repos/:owner/:repo/branches/main/protection | jq '
{
  required_status_checks: .required_status_checks.contexts,
  enforce_admins: .enforce_admins.enabled,
  required_linear_history: .required_linear_history.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled,
  required_pull_request_reviews: .required_pull_request_reviews
}'
```

Expected:

- `enforce_admins.enabled = true`
- `required_linear_history.enabled = true`
- `allow_force_pushes.enabled = false`
- `allow_deletions.enabled = false`
- `required_status_checks.contexts` includes at minimum:
  `Bundle budget`, `Vitest (unit)`, `Lighthouse`, `CodeQL`,
  `License check`, `Secret scan`.

## When a hot-fix needs to bypass

Don't disable the rule. Either:

1. Open the PR, get a one-line approval, merge (fastest if the team is
   online).
2. Push to a `hotfix/*` branch, deploy from there via the deploy
   workflow, and back-merge into `main` through a normal PR.

The whole point of the rule is to prevent "I'll just push to main this
once" — which is also how production goes down at 2am.

## Drift detection

The DR runbook (`docs/ops/DR-PLAYBOOK.md`) includes a quarterly check
that confirms branch protection is intact. Re-run the verification
command above and diff against the expected output.
