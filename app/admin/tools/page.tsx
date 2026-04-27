import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { TOOLS, TOOL_CATEGORIES } from "@/app/tools/_data/tools-list";

export const dynamic = "force-dynamic";

type ToolSetting = { slug: string; disabled: boolean };
type TierRow = {
  tier_id: string;
  name: string;
  sort_order: number;
  allowed_tool_slugs: unknown;
};

const TIER_ORDER = ["free", "pro", "team", "enterprise"];

/**
 * Admin tools list. Shows every entry from tools-list.ts (the canonical
 * registry the AppStore reads from) and overlays:
 *  - global kill-switch state from public.tool_settings
 *  - tier coverage from public.subscription_tiers.allowed_tool_slugs
 *
 * "Empty allow-list" on a tier still means "everything live" per the
 * tool_availability() compat default, so we render those tiers as a
 * neutral dot rather than green/red.
 */
export default async function AdminToolsPage() {
  const admin = createAdminClient();

  const [{ data: settings }, { data: tiers }] = await Promise.all([
    admin.from("tool_settings").select("slug, disabled"),
    admin
      .from("subscription_tiers")
      .select("tier_id, name, sort_order, allowed_tool_slugs")
      .order("sort_order", { ascending: true }),
  ]);

  const disabledMap = new Map<string, boolean>();
  for (const s of (settings ?? []) as ToolSetting[]) {
    disabledMap.set(s.slug, s.disabled);
  }

  const tierRows = ((tiers ?? []) as TierRow[]).slice().sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a.tier_id);
    const ib = TIER_ORDER.indexOf(b.tier_id);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.sort_order - b.sort_order;
  });

  const tierAllowSets = new Map<string, Set<string>>();
  const tierEmpty = new Map<string, boolean>();
  for (const t of tierRows) {
    const arr = Array.isArray(t.allowed_tool_slugs)
      ? (t.allowed_tool_slugs as unknown[]).filter(
          (s): s is string => typeof s === "string"
        )
      : [];
    tierAllowSets.set(t.tier_id, new Set(arr));
    tierEmpty.set(t.tier_id, arr.length === 0);
  }

  const categoryLabel = new Map<string, string>();
  for (const c of TOOL_CATEGORIES) {
    categoryLabel.set(c.key, c.label);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Tools
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Tool gating</h1>
        <p className="mt-0.5 text-xs text-muted">
          Control which tools are live and which tiers can install them. Click
          a tool to edit its global kill switch, tier coverage, and per-
          workspace overrides.
        </p>
      </div>

      <div className="rounded-xl border border-app bg-app-elevated">
        <div className="grid grid-cols-[40px_minmax(0,1fr)_140px_120px_180px_60px] items-center gap-3 border-b border-app px-4 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          <div></div>
          <div>Name</div>
          <div>Category</div>
          <div>Status</div>
          <div className="flex items-center gap-3">
            {tierRows.map((t) => (
              <span key={t.tier_id} title={t.name} className="capitalize">
                {t.tier_id}
              </span>
            ))}
          </div>
          <div className="text-right">Edit</div>
        </div>

        {TOOLS.map((tool) => {
          const disabled = disabledMap.get(tool.slug) === true;
          return (
            <div
              key={tool.slug}
              className="grid grid-cols-[40px_minmax(0,1fr)_140px_120px_180px_60px] items-center gap-3 border-b border-app px-4 py-2.5 last:border-b-0 hover:bg-app"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-secondary">
                <span className="text-[0.65rem] uppercase tracking-wider">
                  {tool.slug.slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-app">
                  {tool.title}
                </div>
                <div className="truncate text-[11px] text-muted">
                  {tool.slug}
                </div>
              </div>
              <div className="text-xs text-secondary">
                {categoryLabel.get(tool.category) ?? tool.category}
              </div>
              <div>
                {disabled ? (
                  <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                    Disabled
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {tierRows.map((t) => {
                  const empty = tierEmpty.get(t.tier_id) === true;
                  const inTier =
                    !empty && tierAllowSets.get(t.tier_id)?.has(tool.slug);
                  const cls = empty
                    ? "bg-app border border-app"
                    : inTier
                      ? "bg-emerald-500"
                      : "bg-faint/30";
                  const label = empty
                    ? `${t.name}: all live (no constraint)`
                    : inTier
                      ? `${t.name}: included`
                      : `${t.name}: not in allow-list`;
                  return (
                    <span
                      key={t.tier_id}
                      title={label}
                      className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`}
                    />
                  );
                })}
              </div>
              <div className="text-right">
                <Link
                  href={`/admin/tools/${tool.slug}`}
                  className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                >
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
