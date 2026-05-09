// scripts/seed-app-registry.mjs
//
// Seeder for public.app_registry. Reads tools-list.ts and extracts the
// 125 ToolItem entries (each is a one-line literal in that file), plus
// adds OS-shell native apps that aren't in the tools list. Runs as one
// SQL upsert via the Supabase Management API.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TOOLS_LIST_PATH = path.join(REPO_ROOT, "app/tools/_data/tools-list.ts");

const SUPA_REF = process.env.SUPABASE_PROJECT_REF || "your-supabase-project-ref";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

/* ─────────────── parse tools-list.ts (one entry per line) ─────────────── */

const SOURCE = fs.readFileSync(TOOLS_LIST_PATH, "utf8");
const ARR_HEADER = "export const TOOLS: ToolItem[]";
const arrStart = SOURCE.indexOf(ARR_HEADER);
if (arrStart < 0) {
  console.error("could not find TOOLS array");
  process.exit(1);
}
const lines = SOURCE.slice(arrStart).split("\n");

function pickField(line, name) {
  // Match name: "value" with escaped quotes inside the value.
  const re = new RegExp(`${name}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = line.match(re);
  if (m) return m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  // Try single-quoted as a fallback.
  const re2 = new RegExp(`${name}\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`);
  const m2 = line.match(re2);
  if (m2) return m2[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  return null;
}

const SOLUTIONS_CATS = new Set([
  "productivity","finance","hr","marketing","sales","legal","data",
  "design","support","growth","content","crm","files",
]);

const seen = new Set();
const rows = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{ slug:")) continue;
  const slug = pickField(trimmed, "slug");
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);
  const title = pickField(trimmed, "title") || slug;
  const description = pickField(trimmed, "description") || "";
  const category = pickField(trimmed, "category") || "";
  const icon = pickField(trimmed, "icon");
  const route = pickField(trimmed, "route");
  const domain =
    (route && route.startsWith("/solutions/")) || SOLUTIONS_CATS.has(category)
      ? "solutions"
      : "re";
  rows.push({
    id: slug,
    domain,
    title,
    description,
    category,
    icon,
    published: true,
    access_mode: "authenticated",
  });
}

console.log(`extracted ${rows.length} tool entries from tools-list.ts`);

/* ─────────────── OS-shell native apps ─────────────── */

const OS_APPS = [
  ["launchpad",         "Launchpad",         "OS shell launcher."],
  ["files",             "Files",             "Workspace file manager."],
  ["documents",         "Documents",         "Pro document editor."],
  ["settings",          "Settings",          "Workspace + system preferences."],
  ["trash",             "Trash",             "Soft-deleted files."],
  ["downloads",         "Downloads",         "User downloads."],
  ["shared-with-me",    "Shared with me",    "Files shared by other workspaces."],
  ["favorites",         "Favorites",         "Pinned files & links."],
  ["control-center",    "Control Center",    "Quick toggles + agent."],
  ["spotlight",         "Spotlight",         "Cross-app search."],
  ["agent-chat",        "Agent Chat",        "Floating assistant panel."],
  ["mission-control",   "Mission Control",   "Window overview."],
  ["clipboard-history", "Clipboard History", "Recent clipboard items."],
  ["pomodoro",          "Pomodoro",          "Top-bar focus timer."],
  ["notifications",     "Notifications",     "OS notification center."],
];
for (const [id, title, description] of OS_APPS) {
  if (seen.has(id)) continue;
  rows.push({
    id,
    domain: "os",
    title,
    description,
    category: "os",
    icon: null,
    published: true,
    access_mode: "authenticated",
  });
}

console.log(`total rows including OS apps: ${rows.length}`);

/* ─────────────── upsert via Management API ─────────────── */

const sql = `
insert into public.app_registry (id, domain, title, description, category, icon, published, access_mode)
select id, domain, title, description, category, icon, published, access_mode
from jsonb_to_recordset($1::jsonb)
  as t(id text, domain text, title text, description text, category text, icon text, published boolean, access_mode text)
on conflict (id) do update set
  domain      = excluded.domain,
  title       = excluded.title,
  description = excluded.description,
  category    = excluded.category,
  icon        = coalesce(excluded.icon, public.app_registry.icon);
`;

// Management API doesn't support parameterised queries, so inline the
// JSON. Quote-escape via $tag$..$tag$ dollar-quoted strings in plpgsql.
const inlineSql = `
insert into public.app_registry (id, domain, title, description, category, icon, published, access_mode)
select id, domain, title, description, category, icon, published, access_mode
from jsonb_to_recordset($app_seed$${JSON.stringify(rows)}$app_seed$::jsonb)
  as t(id text, domain text, title text, description text, category text, icon text, published boolean, access_mode text)
on conflict (id) do update set
  domain      = excluded.domain,
  title       = excluded.title,
  description = excluded.description,
  category    = excluded.category,
  icon        = coalesce(excluded.icon, public.app_registry.icon);
select count(*)::int as total from public.app_registry;
`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${SUPA_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: inlineSql }),
  },
);

const text = await res.text();
console.log("HTTP", res.status, text.slice(0, 500));
if (!res.ok) process.exit(2);
