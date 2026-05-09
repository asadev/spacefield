import Link from "next/link";

import { createCustomSkill } from "../_actions";
import SkillForm from "../_components/SkillForm";

export const dynamic = "force-dynamic";

/**
 * Create a new admin-defined ("custom") skill. Code-defined skills are
 * registered via the runtime imports — this page intentionally only
 * supports kind='custom'. The form forces kind on submit; the runtime
 * loader (`_db_loader.ts`) treats custom skills as a generic dispatcher
 * that calls the configured RPC or HTTP handler for each tool.
 */
export default function AdminSkillNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/skills"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Skills
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          New custom skill
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: kind=custom, status=draft, category=general, all roles
          allowed. Drafts are admin-only until you flip status to live.
          Define each tool inline — the runtime validates input against the
          JSON schema before dispatching to the configured RPC or HTTPS
          handler.
        </p>
      </div>

      <SkillForm
        mode="create"
        action={createCustomSkill}
        forceKind="custom"
      />
    </div>
  );
}
