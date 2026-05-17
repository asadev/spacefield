# Settings backup

Snapshot the admin-side config tables to a portable JSON file. Run
before risky migrations, role changes, or feature-flag rollouts so
there's a known-good restore point.

## What's in the snapshot

- `workspaces` — workspace registry (proxy for "workspace settings"
  until a dedicated table exists).
- `runtime_config` — runtime feature switches and tunables.
- `admin_pages` — custom admin pages.
- `admin_roles` — RBAC role definitions.
- `feature_flags` — feature flag definitions + rollout strategies.

Missing tables are skipped with a warning rather than failing the
whole run.

## Run it

From the repo root:

```bash
source credentials/spacefield-env.sh
pnpm tsx scripts/backup-settings.ts
```

Defaults to `backups/<YYYY-MM-DD>.json`. Override with `--out`:

```bash
pnpm tsx scripts/backup-settings.ts --out /tmp/pre-rbac-migration.json
```

Required env (loaded from `credentials/spacefield-env.sh`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Schedule

Run manually before any change touching:

- Admin RBAC migrations
- Feature flag rollout strategy changes
- Bulk runtime config edits
- Any release tagged with `[risky]`

For automated daily snapshots, wire to a cron (Hostinger or a Vercel
cron) — out of scope here; this script is the building block.

## Restore

There's no automated restore. The JSON is the source for a manual
upsert via the admin UI or a one-shot SQL/PostgREST script. Restoring
a single table:

```bash
node -e '
  const f = require("./backups/2026-05-17.json");
  const t = f.tables.find(t => t.name === "runtime_config");
  console.log(JSON.stringify(t.rows));
' > /tmp/runtime_config.json
# then PATCH/POST those rows via PostgREST with the service-role key.
```

Tracking a clean restore path is a TODO — when we need it, build a
`scripts/restore-settings.ts` that takes the JSON + a `--table` flag
and upserts via PostgREST.

## Where the snapshots live

- Local working copy: `backups/` (gitignored).
- Offsite: upload to the ops bucket manually (1Password "Spacefield
  Ops Bucket" credential) or attach to the incident doc.

Never commit a snapshot — they may contain workspace names and
config that we don't want in the public repo history.
