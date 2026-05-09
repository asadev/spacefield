import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDate, inputClass, listAuthUsers } from "../_lib";
import { loadAllTools } from "../tools-catalog/_data";
import CmdKListener from "./CmdKListener";

export const dynamic = "force-dynamic";

const PER_CATEGORY = 25;

type CategoryKey =
  | "users"
  | "workspaces"
  | "apps"
  | "agents"
  | "skills"
  | "models"
  | "toshare"
  | "files"
  | "features"
  | "tools";

type Hit = {
  id: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  href: string;
};

type Category = {
  key: CategoryKey;
  label: string;
  hits: Hit[];
  more?: number;
};

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const lower = q.toLowerCase();

  const categories: Category[] = q
    ? await runSearch(q, lower)
    : emptyCategories();

  const totalHits = categories.reduce((acc, c) => acc + c.hits.length, 0);

  return (
    <div className="space-y-5">
      <CmdKListener />
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Global · ⌘K
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Search</h1>
        <p className="mt-0.5 text-xs text-muted">
          Cross-table substring search across users, workspaces, apps, agents,
          skills, models, feature flags, the tool catalog, toShare links, and
          files. Up to {PER_CATEGORY} results per category.
        </p>
      </div>

      <form action="/admin/search" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search anything (email, slug, id, name)…"
          className={`${inputClass} h-10 max-w-xl flex-1`}
          autoFocus
          data-cmdk-input="1"
        />
        <button
          type="submit"
          className="h-10 rounded-lg border border-app bg-app-elevated px-4 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Search
        </button>
      </form>

      {!q ? (
        <div className="rounded-xl border border-app bg-app-elevated p-6 text-center text-sm text-faint">
          Type a query above to search.
        </div>
      ) : totalHits === 0 ? (
        <div className="rounded-xl border border-app bg-app-elevated p-6 text-center text-sm text-faint">
          No matches for{" "}
          <span className="font-mono text-secondary">&ldquo;{q}&rdquo;</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {categories.map((c) => (
            <CategoryCard key={c.key} category={c} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ category, q }: { category: Category; q: string }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-app">{category.label}</h2>
          <span className="text-[11px] text-faint">
            {category.hits.length}
            {category.more ? ` (+${category.more} more)` : ""}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-faint">
          {category.key}
        </span>
      </div>
      {category.hits.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-faint">
          No matches.
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--border-app,_theme(colors.gray.200))]">
          {category.hits.map((h) => (
            <li key={`${category.key}:${h.id}`} className="px-3 py-2">
              <Link
                href={h.href}
                className="group flex flex-col gap-0.5"
                title={h.subtitle ?? h.title}
              >
                <span className="line-clamp-1 break-all text-sm text-app group-hover:text-tool-accent">
                  {highlight(h.title, q)}
                </span>
                {h.subtitle && (
                  <span
                    className="line-clamp-1 break-all font-mono text-[11px] text-secondary"
                    title={h.subtitle}
                  >
                    {highlight(h.subtitle, q)}
                  </span>
                )}
                {h.meta && (
                  <span className="text-[10px] text-faint">{h.meta}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Highlight occurrences of the query (case-insensitive) inside a string. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-tool-accent-soft px-0.5 text-tool-accent">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function emptyCategories(): Category[] {
  return [
    { key: "users", label: "Users", hits: [] },
    { key: "workspaces", label: "Workspaces", hits: [] },
    { key: "apps", label: "Apps", hits: [] },
    { key: "agents", label: "Agents", hits: [] },
    { key: "skills", label: "Skills", hits: [] },
    { key: "models", label: "Models", hits: [] },
    { key: "features", label: "Feature flags", hits: [] },
    { key: "tools", label: "Tool catalog", hits: [] },
    { key: "toshare", label: "toShare links", hits: [] },
    { key: "files", label: "Files", hits: [] },
  ];
}

/* ────────────────────── search runner ────────────────────── */

async function runSearch(q: string, lower: string): Promise<Category[]> {
  const admin = createAdminClient();

  // Fan out everything in parallel.
  const [
    usersRes,
    workspacesRes,
    appsRes,
    agentsRes,
    skillsRes,
    modelsRes,
    toshareRes,
    filesRes,
    flagsRes,
    toolsRes,
  ] = await Promise.all([
    listAuthUsers({ page: 1, perPage: PER_CATEGORY, emailLike: q }),
    admin
      .from("workspaces")
      .select("id, name, slug, created_at")
      .or(`name.ilike.%${escapeForOr(q)}%,slug.ilike.%${escapeForOr(q)}%`)
      .order("created_at", { ascending: false })
      .limit(PER_CATEGORY),
    admin
      .from("app_registry")
      .select("id, title, domain, category, published")
      .or(`id.ilike.%${escapeForOr(q)}%,title.ilike.%${escapeForOr(q)}%`)
      .order("title", { ascending: true })
      .limit(PER_CATEGORY),
    admin
      .from("ai_agents")
      .select("id, display_name, kind, status")
      .or(
        `id.ilike.%${escapeForOr(q)}%,display_name.ilike.%${escapeForOr(q)}%`
      )
      .order("display_name", { ascending: true })
      .limit(PER_CATEGORY),
    admin
      .from("ai_skills")
      .select("id, display_name, kind, status, category")
      .or(
        `id.ilike.%${escapeForOr(q)}%,display_name.ilike.%${escapeForOr(q)}%`
      )
      .order("display_name", { ascending: true })
      .limit(PER_CATEGORY),
    admin
      .from("ai_models")
      .select("id, label, provider, status")
      .or(`id.ilike.%${escapeForOr(q)}%,label.ilike.%${escapeForOr(q)}%`)
      .order("label", { ascending: true })
      .limit(PER_CATEGORY),
    admin
      .from("toshare_links")
      .select(
        "id, slug, type, status, workspace_id, custom_subdomain, created_at"
      )
      .ilike("slug", `%${escapeForLike(q)}%`)
      .order("created_at", { ascending: false })
      .limit(PER_CATEGORY),
    admin
      .from("workspace_files")
      .select(
        "id, name, workspace_id, size_bytes, content_type, deleted_at, created_at"
      )
      .ilike("name", `%${escapeForLike(q)}%`)
      .order("created_at", { ascending: false })
      .limit(PER_CATEGORY),
    admin
      .from("feature_flags")
      .select("key, title, enabled, rollout, rollout_percent")
      .or(`key.ilike.%${escapeForOr(q)}%,title.ilike.%${escapeForOr(q)}%`)
      .order("key", { ascending: true })
      .limit(PER_CATEGORY),
    // Tools-catalog: load the merged catalog, then substring-match in
    // memory. The catalog loader is the single source of truth for what
    // counts as a "tool" on the platform.
    loadAllTools()
      .then((res) => res.rows)
      .catch(() => []),
  ]);

  // Note: lower is used by callers in case-insensitive substring helpers.
  void lower;

  type WsRow = { id: string; name: string | null; slug: string; created_at: string };
  type AppRow = {
    id: string;
    title: string;
    domain: string;
    category: string;
    published: boolean;
  };
  type AgentRow = {
    id: string;
    display_name: string;
    kind: string;
    status: string;
  };
  type SkillRow = {
    id: string;
    display_name: string;
    kind: string;
    status: string;
    category: string;
  };
  type ModelRow = {
    id: string;
    label: string;
    provider: string;
    status: string;
  };
  type ToshareRow = {
    id: string;
    slug: string;
    type: string;
    status: string;
    workspace_id: string | null;
    custom_subdomain: string | null;
    created_at: string;
  };
  type FileRow = {
    id: string;
    name: string;
    workspace_id: string;
    size_bytes: number;
    content_type: string | null;
    deleted_at: string | null;
    created_at: string;
  };
  type FlagRow = {
    key: string;
    title: string;
    enabled: boolean;
    rollout: string;
    rollout_percent: number;
  };

  const userHits: Hit[] = usersRes.rows.slice(0, PER_CATEGORY).map((u) => ({
    id: u.id,
    title: u.email ?? "(no email)",
    subtitle: u.id,
    meta: u.created_at ? `created ${formatDate(u.created_at)}` : null,
    href: `/admin/users/${u.id}`,
  }));

  const workspaceHits: Hit[] = ((workspacesRes.data ?? []) as WsRow[]).map(
    (w) => ({
      id: w.id,
      title: w.name ?? "(unnamed)",
      subtitle: w.slug,
      meta: w.created_at ? `created ${formatDate(w.created_at)}` : null,
      href: `/admin/workspaces/${w.id}`,
    })
  );

  const appHits: Hit[] = ((appsRes.data ?? []) as AppRow[]).map((a) => ({
    id: a.id,
    title: a.title,
    subtitle: a.id,
    meta: `${a.domain} · ${a.category || "—"}${a.published ? "" : " · unpublished"}`,
    href: `/admin/apps/${a.id}`,
  }));

  const agentHits: Hit[] = ((agentsRes.data ?? []) as AgentRow[]).map((a) => ({
    id: a.id,
    title: a.display_name,
    subtitle: a.id,
    meta: `${a.kind} · ${a.status}`,
    href: `/admin/agents/${a.id}`,
  }));

  const skillHits: Hit[] = ((skillsRes.data ?? []) as SkillRow[]).map((s) => ({
    id: s.id,
    title: s.display_name,
    subtitle: s.id,
    meta: `${s.kind} · ${s.status} · ${s.category}`,
    href: `/admin/skills/${s.id}`,
  }));

  const modelHits: Hit[] = ((modelsRes.data ?? []) as ModelRow[]).map((m) => ({
    id: m.id,
    title: m.label,
    subtitle: m.id,
    meta: `${m.provider} · ${m.status}`,
    href: `/admin/models/${m.id}`,
  }));

  const toshareHits: Hit[] = ((toshareRes.data ?? []) as ToshareRow[]).map(
    (t) => ({
      id: t.id,
      title: t.slug,
      subtitle: t.custom_subdomain
        ? `${t.custom_subdomain}.toshare.net/${t.slug}`
        : `toshare.net/${t.slug}`,
      meta: `${t.type} · ${t.status}${t.created_at ? ` · ${formatDate(t.created_at)}` : ""}`,
      href: `/admin/analytics/${t.id}`,
    })
  );

  const fileHits: Hit[] = ((filesRes.data ?? []) as FileRow[]).map((f) => ({
    id: f.id,
    title: f.name,
    subtitle: f.content_type ?? null,
    meta: `${formatBytesShort(f.size_bytes)} · ws ${f.workspace_id.slice(0, 8)}${f.deleted_at ? " · trashed" : ""}`,
    href: `/admin/workspaces/${f.workspace_id}`,
  }));

  const flagHits: Hit[] = ((flagsRes.data ?? []) as FlagRow[]).map((f) => ({
    id: f.key,
    title: f.title || f.key,
    subtitle: f.key,
    meta: `${f.enabled ? "on" : "off"} · ${f.rollout}${
      f.rollout === "percent" ? ` ${f.rollout_percent}%` : ""
    }`,
    href: `/admin/features/${encodeURIComponent(f.key)}`,
  }));

  // Tools-catalog: substring-match against name + display_name + description.
  const toolHits: Hit[] = (toolsRes ?? [])
    .filter((t) => {
      const hay = `${t.name} ${t.display_name} ${t.description}`.toLowerCase();
      return hay.includes(lower);
    })
    .slice(0, PER_CATEGORY)
    .map((t) => ({
      id: `${t.source}:${t.source_id}:${t.name}`,
      title: t.display_name || t.name,
      subtitle: t.name,
      meta: `${t.source_label} · ${t.category || "uncategorized"}${
        t.read_only ? " · read-only" : ""
      }`,
      href: `/admin/tools-catalog/${encodeURIComponent(t.source)}/${encodeURIComponent(t.source_id)}`,
    }));

  return [
    { key: "users", label: "Users", hits: userHits },
    { key: "workspaces", label: "Workspaces", hits: workspaceHits },
    { key: "apps", label: "Apps", hits: appHits },
    { key: "agents", label: "Agents", hits: agentHits },
    { key: "skills", label: "Skills", hits: skillHits },
    { key: "models", label: "Models", hits: modelHits },
    { key: "features", label: "Feature flags", hits: flagHits },
    { key: "tools", label: "Tool catalog", hits: toolHits },
    { key: "toshare", label: "toShare links", hits: toshareHits },
    { key: "files", label: "Files", hits: fileHits },
  ];
}

/** Escape a value for use inside a PostgREST `.ilike()` pattern. We
 * percent-encode the metacharacters `%` and `_` so a query containing
 * those is treated as a literal. */
function escapeForLike(s: string): string {
  return s.replace(/[\\_%]/g, (m) => `\\${m}`);
}

/** PostgREST's `.or()` parser disallows commas and parentheses inside
 * a value. Strip them — we never want to search for those literal
 * characters inside ids/names anyway. */
function escapeForOr(s: string): string {
  return escapeForLike(s).replace(/[(),]/g, " ");
}

function formatBytesShort(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
