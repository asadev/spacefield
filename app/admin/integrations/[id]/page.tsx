import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime } from "../../_lib";
import { updateIntegration } from "../_actions";
import IntegrationForm from "../_IntegrationForm";
import {
  STATUS_CHIP_CLASS,
  readRequiredEnv,
  verifyEnvVars,
} from "../_helpers";
import Logo from "../_Logo";
import DeleteIntegrationButton from "./_DeleteButton";

import type { IntegrationRow } from "../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ verify?: string }>;
};

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).toLowerCase();
  const verifyMode = sp.verify === "1";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load integration: {error.message}
      </div>
    );
  }
  const row = data as IntegrationRow | null;
  if (!row) notFound();

  const requiredEnv = readRequiredEnv(row.required_env);
  const envCheck = verifyMode ? verifyEnvVars(requiredEnv) : null;
  const allEnvOk =
    envCheck && requiredEnv.length > 0
      ? requiredEnv.every((n) => envCheck[n])
      : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/integrations"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Integrations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Logo url={row.logo_url} name={row.display_name} size={40} />
          <div>
            <h1 className="text-xl font-semibold text-app">
              {row.display_name}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-mono">{row.id}</span>
              <span className="rounded-full bg-app-elevated px-2 py-0.5 text-secondary border border-app">
                {row.category}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  STATUS_CHIP_CLASS[row.status]
                }`}
              >
                {row.status}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  row.enabled
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-app text-faint border border-app"
                }`}
              >
                {row.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(row.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(row.created_at)}
          </span>
          {row.homepage_url && (
            <a
              href={row.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-app bg-app px-2 py-1 hover:border-tool-accent hover:text-app"
            >
              Homepage ↗
            </a>
          )}
        </div>
      </div>

      {/* Verify env */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">Required env vars</h2>
            <p className="mt-0.5 text-xs text-muted">
              Click the button to check whether each variable is set on
              the running Node process.
            </p>
          </div>
          <Link
            href={`/admin/integrations/${encodeURIComponent(row.id)}?verify=1`}
            className={buttonClass}
          >
            Verify env
          </Link>
        </div>

        {requiredEnv.length === 0 ? (
          <p className="mt-3 text-xs text-faint">
            No env vars listed. Add some in the &quot;Required env vars&quot;
            field below.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {requiredEnv.map((name) => {
              const present = envCheck?.[name];
              return (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  {verifyMode ? (
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                        present ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    >
                      {present ? "✓" : "✗"}
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-elevated text-[11px] text-faint border border-app">
                      ?
                    </span>
                  )}
                  <span className="font-mono text-xs text-app">{name}</span>
                </div>
              );
            })}
          </div>
        )}

        {verifyMode && requiredEnv.length > 0 && allEnvOk !== null && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${
              allEnvOk
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border border-rose-500/30 bg-rose-500/10 text-rose-500"
            }`}
          >
            {allEnvOk
              ? "All required env vars are present."
              : "One or more env vars are missing. Set them in the deploy environment."}
          </div>
        )}
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit integration</h2>
        <div className="mt-4">
          <IntegrationForm
            mode="edit"
            action={updateIntegration}
            row={row}
          />
        </div>
      </section>

      {/* Danger */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this integration. Code referencing the id
          will start hitting a missing-row 404.
        </p>
        <div className="mt-3">
          <DeleteIntegrationButton id={row.id} />
        </div>
      </section>
    </div>
  );
}
