#!/usr/bin/env -S pnpm tsx
/* eslint-disable no-console */
/* Settings backup — exports admin-side config rows to a JSON snapshot.
 *
 *   pnpm tsx scripts/backup-settings.ts
 *   pnpm tsx scripts/backup-settings.ts --out backups/2026-05-17.json
 *
 * What it dumps (all via the service-role key, bypassing RLS):
 *   - workspaces           — workspace registry (used as "workspace settings"
 *                            until a dedicated workspace_settings table exists)
 *   - runtime_config       — runtime feature switches and tunables
 *   - admin_pages          — custom admin pages
 *   - admin_roles          — RBAC roles
 *   - feature_flags        — feature flag definitions + rollout
 *
 * Output:
 *   - Writes to `backups/<YYYY-MM-DD>.json` by default. Directory is
 *     gitignored elsewhere; the file is intended for manual download
 *     and offline storage.
 *   - Missing tables are skipped with a warning rather than failing the
 *     whole run — useful in dev environments where the admin migrations
 *     haven't been applied yet.
 *
 * Required env (read from process.env; load from your shell or
 * `source credentials/spacefield-env.sh` before invoking):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Why not use the Supabase CLI? `supabase db dump` snapshots the whole
 * schema/data, which is overkill. This script grabs just the config
 * tables we'd actually want to restore individually after a bad change.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Row = Record<string, unknown>;

interface BackupTable {
  name: string;
  rows: Row[] | null;
  error?: string;
}

interface BackupFile {
  version: 1;
  generated_at: string;
  source: string;
  tables: BackupTable[];
}

const TABLES = [
  "workspaces",
  "runtime_config",
  "admin_pages",
  "admin_roles",
  "feature_flags",
] as const;

function parseArgs(argv: string[]): { out: string } {
  const today = new Date().toISOString().slice(0, 10);
  let out = resolve(process.cwd(), "backups", `${today}.json`);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      out = resolve(process.cwd(), argv[i + 1]);
      i++;
    }
  }
  return { out };
}

async function fetchTable(
  baseUrl: string,
  key: string,
  table: string,
): Promise<BackupTable> {
  // PostgREST returns up to 1000 rows per request by default; we page
  // until we get a short page. Config tables are small (< 10K rows in
  // practice) so this is fine.
  const pageSize = 1000;
  const out: Row[] = [];
  let offset = 0;
  /* eslint-disable no-constant-condition */
  while (true) {
    const url = `${baseUrl}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      // 404 / missing table — log but don't crash.
      if (res.status === 404 || /relation .* does not exist/i.test(body)) {
        return { name: table, rows: null, error: `missing (${res.status})` };
      }
      return {
        name: table,
        rows: null,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return { name: table, rows: out };
}

async function main(): Promise<void> {
  const { out } = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    console.error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
    console.error(
      "Tip: `source credentials/spacefield-env.sh` before running this script.",
    );
    process.exit(1);
  }

  const tables: BackupTable[] = [];
  for (const t of TABLES) {
    process.stderr.write(`  ${t} ... `);
    const result = await fetchTable(baseUrl, key, t);
    if (result.rows === null) {
      process.stderr.write(`skipped (${result.error})\n`);
    } else {
      process.stderr.write(`${result.rows.length} rows\n`);
    }
    tables.push(result);
  }

  const file: BackupFile = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: baseUrl,
    tables,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2), "utf8");

  const ok = tables.filter((t) => t.rows !== null).length;
  const skipped = tables.length - ok;
  console.log(`Wrote ${out}`);
  console.log(`  Tables: ${ok} ok, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
