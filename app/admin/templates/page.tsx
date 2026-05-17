import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_TEMPLATES } from "@/lib/workflows/seed-templates";

import TemplatesClient, {
  type TemplateCardRow,
  type WorkspaceOption,
} from "./_components/TemplatesClient";

export const dynamic = "force-dynamic";

/**
 * Industry workspace templates — the admin chooses a target workspace
 * and clicks "Apply" on any template card to insert that template's
 * seed rows.
 *
 * Cards are rendered from `lib/workflows/seed-templates.ts` (the
 * canonical source); the DB row in `workspace_templates` is patched
 * with the same body at apply time so the SECURITY DEFINER RPC has
 * something to read.
 */
export default async function AdminTemplatesPage() {
  const admin = createAdminClient();
  const { data: wsRows } = await admin
    .from("workspaces")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(200);
  const workspaces: WorkspaceOption[] = (wsRows ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string) ?? "(unnamed)",
  }));

  // Build the card rows from the in-process seed registry. The table
  // counts give the admin a sense of how big each apply will be.
  const templates: TemplateCardRow[] = SEED_TEMPLATES.map((t) => {
    const counts: Record<string, number> = {};
    for (const [tbl, rows] of Object.entries(t.body.tables)) {
      counts[tbl] = rows.length;
    }
    return {
      slug: t.slug,
      name: t.name,
      industry: t.industry,
      description: t.description,
      icon: t.icon,
      summary: t.body.summary,
      table_counts: counts,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Apps
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Industry workspace templates
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          One-click seed packs to give a fresh workspace a useful
          starting state. Each template is a JSON manifest of rows the
          SQL RPC inserts in order — see lib/workflows/seed-templates.ts
          for the bodies. Membership/role gates are enforced by the RPC.
        </p>
      </div>
      <TemplatesClient templates={templates} workspaces={workspaces} />
    </div>
  );
}
