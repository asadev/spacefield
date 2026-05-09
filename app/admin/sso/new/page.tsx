import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { inputClass, buttonGhostClass } from "../../_lib";
import { createConfig } from "../_actions";
import ConfigForm from "../ConfigForm";
import { PROTOCOL_LABEL, PROTOCOLS, type Protocol } from "../_helpers";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

type SearchParams = {
  protocol?: string;
};

export default async function NewSsoConfigPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const protocol = (
    PROTOCOLS as readonly string[]
  ).includes(sp.protocol ?? "")
    ? (sp.protocol as Protocol)
    : "saml";

  const admin = createAdminClient();
  const { data } = await admin
    .from("workspaces")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(500);
  const workspaces = (data ?? []) as WorkspaceLite[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/sso"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← SSO
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New SSO config</h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick a protocol below — the form re-renders without saving so
          you only fill the fields that protocol needs.
        </p>
      </div>

      {/* Protocol switcher (GET, no save) */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <form
          method="get"
          action="/admin/sso/new"
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <select
            name="protocol"
            defaultValue={protocol}
            className={inputClass}
          >
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {PROTOCOL_LABEL[p]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Show fields
          </button>
        </form>
      </section>

      <ConfigForm
        config={null}
        protocol={protocol}
        workspaces={workspaces}
        action={createConfig}
        submitLabel="Create config"
      />
    </div>
  );
}
