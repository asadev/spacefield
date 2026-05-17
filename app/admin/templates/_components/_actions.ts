"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { findSeedTemplate } from "@/lib/workflows/seed-templates";

import { recordAdminAction } from "../../_audit";
import { assertAdmin } from "../../_lib";

/**
 * Industry workspace template — apply action.
 *
 * Flow:
 *   1. Look up the workspace_templates row by slug to get its UUID.
 *   2. PATCH its `body` column with the canonical seed JSON from
 *      lib/workflows/seed-templates.ts (so the migration doesn't have
 *      to carry hundreds of lines of seed data and we can hot-edit
 *      copy without a new SQL file).
 *   3. Call public.apply_workspace_template(template_id, workspace_id)
 *      which does the membership/role gate + the inserts.
 *
 * The RPC enforces:
 *   - caller is a workspace member
 *   - caller has owner|admin role on that workspace
 *
 * Returns the row count on success.
 *
 * Types live inline (this is a "use server" file — exports must be
 * async functions only, no type re-exports).
 */
export async function applyTemplate(input: {
  slug: string;
  workspace_id: string;
}): Promise<{ ok: true; rows_inserted: number } | { ok: false; error: string }> {
  await assertAdmin();

  if (!input.slug) return { ok: false, error: "slug is required" };
  if (!/^[0-9a-f-]{36}$/i.test(input.workspace_id)) {
    return { ok: false, error: "workspace_id must be a UUID" };
  }

  const seed = findSeedTemplate(input.slug);
  if (!seed) return { ok: false, error: `unknown template: ${input.slug}` };

  const admin = createAdminClient();

  // Look up the template row.
  const { data: row, error: rowErr } = await admin
    .from("workspace_templates")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (rowErr || !row) {
    return {
      ok: false,
      error: rowErr?.message ?? `template row not found for slug ${input.slug}`,
    };
  }

  // Patch the body with the canonical seed JSON. This is idempotent —
  // we just want the freshest seed on the row before we call the RPC.
  const { error: patchErr } = await admin
    .from("workspace_templates")
    .update({ body: seed.body, name: seed.name, description: seed.description })
    .eq("id", row.id);
  if (patchErr) {
    return { ok: false, error: `patch failed: ${patchErr.message}` };
  }

  // Call the RPC. The function is SECURITY DEFINER so it runs with
  // elevated privileges, but the membership/role check inside the
  // function uses auth.uid() — which is null when called via the
  // service-role client. So we use rpc() WITH the service role here
  // and just rely on the assertAdmin() gate above.
  //
  // Note: we explicitly skip the in-RPC permission check for the
  // service-role path by passing the workspace_id through. The RPC
  // is still safe because:
  //   - assertAdmin() above guarantees the caller is a platform admin
  //   - the apply only runs into the workspace_id the admin chose
  //   - the table allow-list inside the RPC stops smuggling
  const { data: count, error: rpcErr } = await admin.rpc(
    "apply_workspace_template",
    {
      p_template_id: row.id,
      p_workspace_id: input.workspace_id,
    }
  );
  if (rpcErr) {
    return { ok: false, error: `apply failed: ${rpcErr.message}` };
  }

  const rowsInserted = typeof count === "number" ? count : 0;
  await recordAdminAction({
    action: "workspace_template.apply",
    targetType: "workspace_templates",
    targetId: row.id as string,
    metadata: {
      slug: input.slug,
      workspace_id: input.workspace_id,
      rows_inserted: rowsInserted,
    },
  });

  revalidatePath("/admin/templates");
  return { ok: true, rows_inserted: rowsInserted };
}
