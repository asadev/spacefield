import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonGhostClass, formatDateTime } from "../../_lib";
import { deleteConfig, setStatus, updateConfig } from "../_actions";
import ConfigForm from "../ConfigForm";
import {
  PROTOCOLS,
  STATUSES,
  STATUS_LABEL,
  describeMissingFields,
  type Protocol,
} from "../_helpers";

import type { SsoConfigRow } from "../../_types";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSsoConfigPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const [cfgRes, wsRes] = await Promise.all([
    admin.from("sso_configs").select("*").eq("id", id).maybeSingle(),
    admin
      .from("workspaces")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(500),
  ]);

  const config = (cfgRes.data as SsoConfigRow | null) ?? null;
  if (!config) notFound();
  const workspaces = (wsRes.data ?? []) as WorkspaceLite[];

  const protocol = (PROTOCOLS as readonly string[]).includes(config.protocol)
    ? (config.protocol as Protocol)
    : "saml";
  const missing = describeMissingFields(protocol, config);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/sso"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← SSO
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Edit SSO config
        </h1>
        <p className="mt-0.5 font-mono text-[11px] text-muted">{config.id}</p>
      </div>

      {/* Status quick-actions */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
            Quick status
          </span>
          {STATUSES.map((s) => (
            <form key={s} action={setStatus} className="inline-flex">
              <input type="hidden" name="id" value={config.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  config.status === s
                    ? "bg-tool-accent text-white"
                    : "bg-app text-secondary border border-app hover:border-tool-accent"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Test SSO placeholder — runtime test is environmental */}
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Test SSO
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Live SSO test requires deployment. The redirect handshake
          depends on env vars + provider-side allowlists; we can't do a
          dry-run from this admin form.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-amber-500/30 bg-app-elevated px-3 py-1.5 text-xs text-amber-600 opacity-60 dark:text-amber-400"
        >
          Test SSO (deployment-only)
        </button>
      </section>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <strong className="font-semibold">Missing required fields:</strong>{" "}
          {missing.join(", ")}
        </div>
      )}

      <ConfigForm
        config={config}
        protocol={protocol}
        workspaces={workspaces}
        action={updateConfig}
        submitLabel="Save changes"
      />

      <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-rose-500">Delete config</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Removes the SSO config entirely. Audit log keeps a copy.
          </p>
        </div>
        <form action={deleteConfig}>
          <input type="hidden" name="id" value={config.id} />
          <button
            type="submit"
            className={`${buttonGhostClass} border-rose-500/30 text-rose-500 hover:border-rose-500`}
          >
            Delete this config
          </button>
        </form>
      </section>

      <div className="text-[11px] text-muted">
        Created{" "}
        <span className="font-mono">{formatDateTime(config.created_at)}</span>
        {" · "}
        Updated{" "}
        <span className="font-mono">{formatDateTime(config.updated_at)}</span>
      </div>
    </div>
  );
}
