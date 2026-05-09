import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime } from "../_lib";
import {
  PROTOCOL_LABEL,
  STATUS_LABEL,
  protocolChipClass,
  statusChipClass,
  type Protocol,
  type SsoStatus,
} from "./_helpers";

import type { SsoConfigRow } from "../_types";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

export default async function AdminSsoPage() {
  const admin = createAdminClient();

  const { data: cfgData, error: cfgErr } = await admin
    .from("sso_configs")
    .select("*")
    .order("created_at", { ascending: false });
  if (cfgErr) throw new Error(cfgErr.message);
  const configs = (cfgData ?? []) as SsoConfigRow[];

  // Resolve workspace names for the rows.
  const wsIds = Array.from(
    new Set(
      configs
        .map((c) => c.workspace_id)
        .filter((v): v is string => typeof v === "string")
    )
  );
  let wsMap = new Map<string, string>();
  if (wsIds.length > 0) {
    const { data: wsData } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    for (const ws of (wsData ?? []) as WorkspaceLite[]) {
      wsMap.set(ws.id, ws.name);
    }
  }

  const stats = computeStats(configs);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Security
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">SSO</h1>
          <p className="mt-0.5 text-xs text-muted">
            Per-workspace SAML / OIDC / Google / Microsoft identity
            providers. Global configs apply when no workspace is set.
          </p>
        </div>
        <Link href="/admin/sso/new" className={buttonClass}>
          + New config
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} accent="emerald" />
        <StatCard label="Pending" value={stats.pending} accent="amber" />
        <StatCard label="Failed" value={stats.failed} accent="rose" />
        <StatCard label="Disabled" value={stats.disabled} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Protocol</th>
              <th className="px-3 py-2 text-left font-normal">Display name</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No SSO configs yet.{" "}
                  <Link
                    href="/admin/sso/new"
                    className="text-tool-accent hover:underline"
                  >
                    Add the first one.
                  </Link>
                </td>
              </tr>
            ) : (
              configs.map((cfg) => (
                <ConfigRow
                  key={cfg.id}
                  config={cfg}
                  workspaceName={
                    cfg.workspace_id ? wsMap.get(cfg.workspace_id) ?? null : null
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────── components ─────────────────────── */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "rose";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "rose"
          ? "text-rose-500"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function ProtocolChip({ protocol }: { protocol: Protocol }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${protocolChipClass(
        protocol
      )}`}
    >
      {PROTOCOL_LABEL[protocol]}
    </span>
  );
}

function StatusChip({ status }: { status: SsoStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChipClass(
        status
      )}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ConfigRow({
  config,
  workspaceName,
}: {
  config: SsoConfigRow;
  workspaceName: string | null;
}) {
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <ProtocolChip protocol={config.protocol as Protocol} />
      </td>
      <td className="px-3 py-2 text-app">{config.display_name}</td>
      <td className="px-3 py-2 text-secondary">
        {config.workspace_id ? (
          <span className="truncate" title={config.workspace_id}>
            {workspaceName ?? (
              <span className="font-mono text-[11px] text-muted">
                {config.workspace_id.slice(0, 8)}…
              </span>
            )}
          </span>
        ) : (
          <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] text-faint border border-app">
            Global
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusChip status={config.status as SsoStatus} />
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(config.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/sso/${config.id}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function computeStats(rows: SsoConfigRow[]) {
  let active = 0;
  let pending = 0;
  let failed = 0;
  let disabled = 0;
  for (const r of rows) {
    if (r.status === "active") active += 1;
    else if (r.status === "pending") pending += 1;
    else if (r.status === "failed") failed += 1;
    else if (r.status === "disabled") disabled += 1;
  }
  return { total: rows.length, active, pending, failed, disabled };
}
