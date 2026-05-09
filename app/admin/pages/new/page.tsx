import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import type { AdminRoleRow } from "../../_types";
import { PageHeaderForm } from "../_PageHeaderForm";

export const dynamic = "force-dynamic";

/**
 * /admin/pages/new — blank create form.
 *
 * After submit, the action redirects to /admin/pages/<id> where the
 * admin can start adding blocks.
 */
export default async function AdminPagesNewPage() {
  const sb = createAdminClient();
  const rolesRes = await sb
    .from("admin_roles")
    .select("*")
    .order("display_name", { ascending: true });
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
        <h1 className="mt-2 text-xl font-semibold text-app">New page</h1>
        <p className="mt-1 text-xs text-muted">
          Start with the page metadata. After save you can add KPI cards,
          tables, charts, markdown, buttons, iframes, and forms.
        </p>
      </div>

      <PageHeaderForm mode="create" page={null} roles={roles} />
    </div>
  );
}
