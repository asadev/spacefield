import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, buttonGhostClass, inputClass } from "../../_lib";
import type { AdminRoleRow } from "../../_types";
import { createRole } from "../_actions";

export const dynamic = "force-dynamic";

export default async function AdminRolesNewPage() {
  const admin = createAdminClient();
  const { data: rolesData } = await admin
    .from("admin_roles")
    .select("id, display_name, is_system_default")
    .order("is_system_default", { ascending: false })
    .order("display_name", { ascending: true });

  const roles = (rolesData ?? []) as Pick<
    AdminRoleRow,
    "id" | "display_name" | "is_system_default"
  >[];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/roles"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Roles &amp; permissions
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New role</h1>
        <p className="mt-1 text-sm text-secondary">
          Roles bundle (resource × action) permissions. After creating
          you&apos;ll land on the role editor where you can flip the
          permission matrix.
        </p>
      </div>

      <form
        action={createRole}
        className="space-y-4 rounded-xl border border-app bg-app-elevated p-5"
      >
        <Field
          label="Role id"
          hint="lowercase + dashes, e.g. `support-l2`. Used as the URL slug."
        >
          <input
            type="text"
            name="id"
            required
            placeholder="support-l2"
            pattern="^[a-z][a-z0-9-]*$"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Display name">
          <input
            type="text"
            name="display_name"
            placeholder="Support — Tier 2"
            className={inputClass}
          />
        </Field>

        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            placeholder="What this role is for. Visible to other admins."
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field
          label="Clone permissions from (optional)"
          hint="Copies the source role's permission matrix onto the new role."
        >
          <select
            name="clone_from"
            defaultValue=""
            className={inputClass}
          >
            <option value="">— start blank —</option>
            {roles
              .filter((r) => r.id !== "super-admin")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}{" "}
                  {r.is_system_default ? "(system)" : ""}
                </option>
              ))}
          </select>
        </Field>

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" className={buttonClass}>
            Create role
          </button>
          <Link href="/admin/roles" className={buttonGhostClass}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </label>
  );
}
