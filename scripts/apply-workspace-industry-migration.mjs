// scripts/apply-workspace-industry-migration.mjs
//
// One-shot applier for 20260527c_workspace_industry.sql via the Supabase
// Management API. The CLI db-push pipeline is broken on this project
// (timestamp-suffix pattern + duplicate PK in schema_migrations); this
// script does the equivalent INSERT into supabase_migrations.schema_migrations
// after running the migration SQL itself.
//
// Usage:
//   source ~/ClaudeAsad/credentials/spacefield-env.sh
//   node scripts/apply-workspace-industry-migration.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATION = path.join(
  REPO_ROOT,
  "supabase/migrations/20260527c_workspace_industry.sql"
);

const SUPA_REF = process.env.SUPABASE_PROJECT_REF || "your-supabase-project-ref";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("missing SUPABASE_ACCESS_TOKEN (source spacefield-env.sh)");
  process.exit(1);
}

const sql = fs.readFileSync(MIGRATION, "utf8");

async function runSql(query, label) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPA_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  console.log(`[${label}] HTTP`, res.status, text.slice(0, 800));
  if (!res.ok) {
    process.exit(2);
  }
  return text;
}

await runSql(sql, "migration");

/* Insert into the migration log so future supabase CLI runs don't try
 * to re-apply this. Use a timestamp-only version string ("20260527000003")
 * compatible with the existing convention used by prior migrations.
 * If the row already exists, do nothing. */
const version = "20260527000003";
const name = "workspace_industry";
await runSql(
  `insert into supabase_migrations.schema_migrations (version, name, statements)
   values ('${version}', '${name}', array[]::text[])
   on conflict (version) do nothing;
   select version, name from supabase_migrations.schema_migrations
     where version = '${version}';`,
  "log"
);

/* Verify the column landed. */
await runSql(
  `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'workspaces'
       and column_name = 'industry';
   select count(*) as workspace_count, count(industry) as with_industry
     from public.workspaces;`,
  "verify"
);

console.log("\nMigration applied successfully.");
