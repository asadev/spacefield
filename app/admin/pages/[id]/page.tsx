import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { BlockRenderer } from "@/lib/admin-blocks/BlockRenderer";

import { formatDateTime } from "../../_lib";
import type {
  AdminPageBlockRow,
  AdminPageRow,
  AdminRoleRow,
} from "../../_types";
import { deletePage } from "../_actions";
import { BlockEditor } from "../_BlockEditor";
import { PageHeaderForm } from "../_PageHeaderForm";

export const dynamic = "force-dynamic";

/**
 * /admin/pages/[id] — page editor.
 *
 * Two-pane layout:
 *   - Left: header form (title/section/layout/etc) + block builder.
 *   - Right: live preview rendered through <BlockRenderer>, mirroring
 *            the `layout` setting (single/grid/sidebar/tabbed).
 *
 * The preview is the canonical rendering path — same component the
 * public viewer at /admin/custom/<slug> uses, so what you see here is
 * exactly what an admin sees there.
 */
export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const [pageRes, blocksRes, rolesRes] = await Promise.all([
    sb.from("admin_pages").select("*").eq("id", id).maybeSingle(),
    sb
      .from("admin_page_blocks")
      .select("*")
      .eq("page_id", id)
      .order("sort_order", { ascending: true }),
    sb.from("admin_roles").select("*").order("display_name", { ascending: true }),
  ]);

  const page = pageRes.data as AdminPageRow | null;
  if (!page) notFound();

  const blocks = (blocksRes.data ?? []) as AdminPageBlockRow[];
  const roles = (rolesRes.data ?? []) as AdminRoleRow[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/pages"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Custom pages
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">{page.title}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              page.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {page.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium text-tool-accent">
            {page.section}
          </span>
          <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] font-medium text-secondary">
            {page.layout}
          </span>
          {page.enabled ? (
            <Link
              href={`/admin/custom/${encodeURIComponent(page.id)}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
            >
              View ↗
            </Link>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1 font-mono">
            {page.id}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(page.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-app">Page details</h2>
            <PageHeaderForm mode="edit" page={page} roles={roles} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-app">Blocks</h2>
            <BlockEditor pageId={page.id} blocks={blocks} />
          </section>

          <details className="rounded-xl border border-app bg-app-elevated p-3">
            <summary className="cursor-pointer text-xs text-muted">
              Danger zone
            </summary>
            <form action={deletePage} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="id" value={page.id} />
              <button
                type="submit"
                className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
              >
                Delete page
              </button>
              <span className="text-[11px] text-muted">
                Permanent. Blocks cascade.
              </span>
            </form>
          </details>
        </div>

        <div className="lg:sticky lg:top-[5.5rem] lg:self-start">
          <div className="rounded-xl border border-app bg-app">
            <div className="flex items-center justify-between border-b border-app px-4 py-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Live preview
              </span>
              <span className="text-[11px] text-faint">
                Same renderer as /admin/custom/{page.id}
              </span>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-4">
              <PreviewLayout layout={page.layout}>
                {blocks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-app bg-app-elevated p-6 text-center text-xs text-faint">
                    No blocks. Add one on the left to see it here.
                  </div>
                ) : (
                  blocks.map((b) => <BlockRenderer key={b.id} block={b} />)
                )}
              </PreviewLayout>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewLayout({
  layout,
  children,
}: {
  layout: AdminPageRow["layout"];
  children: React.ReactNode;
}) {
  if (layout === "grid") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    );
  }
  // sidebar + tabbed are tablet/wide-only patterns; we render as a stack
  // in the preview frame to avoid nesting too many levels of grid in the
  // editor. The viewer page applies the proper layout treatments.
  return <div className="space-y-3">{children}</div>;
}
