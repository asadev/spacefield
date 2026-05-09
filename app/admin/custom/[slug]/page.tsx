import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { BlockRenderer } from "@/lib/admin-blocks/BlockRenderer";

import type {
  AdminPageBlockRow,
  AdminPageRow,
} from "../../_types";

export const dynamic = "force-dynamic";

/**
 * /admin/custom/[slug] — public viewer for an admin-defined page.
 *
 * Access: gated by the /admin/* layout's `checkIsAdmin()` check, so only
 * admins reach this. Inside, the page must be `enabled = true` to be
 * rendered — disabled pages 404.
 *
 * Layout modes:
 *   - single  → vertical stack
 *   - sidebar → left TOC + main column (markdown+kpi flow on the right)
 *   - grid    → 2-col responsive grid
 *   - tabbed  → tabs grouped by `block.config.tab` (string), defaulting
 *               to "general". Implemented as native CSS tabs via
 *               <details>/<summary> so we stay zero-JS.
 */
export default async function AdminCustomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = createAdminClient();
  const [pageRes, blocksRes] = await Promise.all([
    sb
      .from("admin_pages")
      .select("*")
      .eq("id", slug)
      .eq("enabled", true)
      .maybeSingle(),
    sb
      .from("admin_page_blocks")
      .select("*")
      .eq("page_id", slug)
      .order("sort_order", { ascending: true }),
  ]);

  const page = pageRes.data as AdminPageRow | null;
  if (!page) notFound();

  const blocks = (blocksRes.data ?? []) as AdminPageBlockRow[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            {page.section}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">{page.title}</h1>
          {page.description ? (
            <p className="mt-0.5 text-xs text-muted">{page.description}</p>
          ) : null}
        </div>
        <Link
          href={`/admin/pages/${encodeURIComponent(page.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Edit page
        </Link>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center">
          <div className="text-sm font-medium text-app">No blocks yet.</div>
          <div className="mt-1 text-[11px] text-muted">
            Open the editor and add some.
          </div>
        </div>
      ) : (
        <PageBody page={page} blocks={blocks} />
      )}
    </div>
  );
}

function PageBody({
  page,
  blocks,
}: {
  page: AdminPageRow;
  blocks: AdminPageBlockRow[];
}) {
  switch (page.layout) {
    case "grid":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
        </div>
      );
    case "sidebar": {
      // Pull all KPI blocks to the left rail, everything else flows main.
      const rail = blocks.filter((b) => b.kind === "kpi" || b.kind === "divider");
      const main = blocks.filter((b) => b.kind !== "kpi" && b.kind !== "divider");
      return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <aside className="space-y-3">
            {rail.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app bg-app-elevated p-4 text-center text-[11px] text-faint">
                Add KPI blocks to fill the sidebar.
              </div>
            ) : (
              rail.map((b) => <BlockRenderer key={b.id} block={b} />)
            )}
          </aside>
          <div className="space-y-4">
            {main.map((b) => (
              <BlockRenderer key={b.id} block={b} />
            ))}
          </div>
        </div>
      );
    }
    case "tabbed": {
      // Group blocks by block.config.tab — undefined falls into "general".
      const groups = new Map<string, AdminPageBlockRow[]>();
      for (const b of blocks) {
        const cfg = (b.config ?? {}) as Record<string, unknown>;
        const tab = String(cfg.tab ?? "general").trim() || "general";
        const arr = groups.get(tab) ?? [];
        arr.push(b);
        groups.set(tab, arr);
      }
      const tabs = Array.from(groups.entries());

      // Native zero-JS tabs: a row of <details> elements where only one
      // can stay open at a time via the same `name` attribute.
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map(([t]) => (
              <span
                key={t}
                className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary border border-app"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {tabs.map(([tab, list], i) => (
              <details
                key={tab}
                name="custom-page-tabs"
                open={i === 0}
                className="rounded-xl border border-app bg-app"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-app">
                  {tab}
                </summary>
                <div className="space-y-3 border-t border-app p-4">
                  {list.map((b) => (
                    <BlockRenderer key={b.id} block={b} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      );
    }
    case "single":
    default:
      return (
        <div className="space-y-4">
          {blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
        </div>
      );
  }
}
