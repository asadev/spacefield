import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../_lib";
import type {
  AdminAuditLogRow,
  WorkspaceCustomDomainRow,
} from "../../_types";
import {
  CheckMark,
  ScopeChip,
  StatusChip,
} from "../_components/StatusChip";
import { RowActions } from "../_components/RowActions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type WorkspaceFull = {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
};

export default async function AdminDomainDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: rowData } = await admin
    .from("workspace_custom_domains")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const row = (rowData as WorkspaceCustomDomainRow | null) ?? null;
  if (!row) notFound();

  const { data: wsData } = await admin
    .from("workspaces")
    .select("id, name, user_id, created_at")
    .eq("id", row.workspace_id)
    .maybeSingle();
  const ws = (wsData as WorkspaceFull | null) ?? null;

  const ownerMap = ws ? await fetchAuthUsersByIds([ws.user_id]) : null;
  const ownerEmail = ws ? ownerMap?.get(ws.user_id)?.email ?? null : null;

  const txtRecordName = `_spacefield-verify.${row.domain}`;
  const cnameTarget = row.cname_target || "cname.vercel-dns.com";

  // Latest action attempts come from the audit log — we don't have a
  // metadata column on workspace_custom_domains, but every verify /
  // attach call records an audit row, so the last-attempt UI reads
  // straight from there.
  const { data: auditData } = await admin
    .from("admin_audit_log")
    .select("*")
    .eq("target_type", "workspace_custom_domain")
    .eq("target_id", row.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const auditRows = (auditData ?? []) as AdminAuditLogRow[];

  const lastVerify = auditRows.find(
    (r) =>
      r.action === "domain.verify_txt" || r.action === "domain.verify_cname"
  );
  const lastVerifyMeta =
    lastVerify && typeof lastVerify.metadata === "object"
      ? (lastVerify.metadata as Record<string, unknown>)
      : {};
  const lastVercel = auditRows.find(
    (r) =>
      r.action === "domain.attach_vercel" || r.action === "domain.disable"
  );
  const lastVercelMeta =
    lastVercel && typeof lastVercel.metadata === "object"
      ? (lastVercel.metadata as Record<string, unknown>)
      : {};

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/domains"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Custom domains
        </Link>
        <h1 className="mt-2 font-mono text-xl font-semibold text-app">
          {row.domain}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusChip status={row.status} />
          <ScopeChip scope={row.scope} />
          <span className="rounded-md border border-app bg-app px-2 py-1 font-mono">
            {row.id.slice(0, 8)}
          </span>
          <span>created {formatDateTime(row.created_at)}</span>
        </div>
      </div>

      {/* Workspace info */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Workspace</h2>
        {ws ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-xs uppercase tracking-wide text-muted">Name</dt>
            <dd>
              <Link
                href={`/admin/workspaces/${ws.id}`}
                className="text-app hover:text-tool-accent"
              >
                {ws.name}
              </Link>
            </dd>
            <dt className="text-xs uppercase tracking-wide text-muted">ID</dt>
            <dd className="font-mono text-xs text-secondary">{ws.id}</dd>
            <dt className="text-xs uppercase tracking-wide text-muted">
              Owner
            </dt>
            <dd>
              <Link
                href={`/admin/users/${ws.user_id}`}
                className="text-app hover:text-tool-accent"
              >
                {ownerEmail ?? ws.user_id.slice(0, 8)}
              </Link>
            </dd>
            <dt className="text-xs uppercase tracking-wide text-muted">
              Created
            </dt>
            <dd className="font-mono text-xs text-secondary">
              {formatDateTime(ws.created_at)}
            </dd>
          </dl>
        ) : (
          <p className="mt-3 text-xs text-faint">
            Workspace not found (orphaned row).
          </p>
        )}
      </section>

      {/* Verification status */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Verification</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatusCell
            label="TXT"
            ok={Boolean(row.txt_verified_at)}
            at={row.txt_verified_at}
          />
          <StatusCell
            label="CNAME"
            ok={Boolean(row.cname_verified_at)}
            at={row.cname_verified_at}
          />
          <StatusCell
            label="Vercel"
            ok={Boolean(row.added_to_vercel_at)}
            at={row.added_to_vercel_at}
          />
        </div>

        <div className="mt-4 border-t border-app pt-4">
          <RowActions row={row} variant="stacked" />
        </div>

        {(lastVerify || lastVercel) && (
          <div className="mt-4 space-y-1 rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
            {lastVerify && (
              <div>
                Last DNS check{" "}
                <span className="font-mono">
                  {formatDateTime(lastVerify.created_at)}
                </span>{" "}
                · {lastVerify.action.replace("domain.verify_", "")} ·{" "}
                <span
                  className={
                    lastVerifyMeta.result === "ok"
                      ? "text-emerald-500"
                      : "text-rose-500"
                  }
                >
                  {lastVerifyMeta.result === "ok" ? "match" : "no match"}
                </span>
                {lastVerify.actor_email && (
                  <> · by {lastVerify.actor_email}</>
                )}
              </div>
            )}
            {lastVercel && (
              <div>
                Last Vercel call{" "}
                <span className="font-mono">
                  {formatDateTime(lastVercel.created_at)}
                </span>{" "}
                · {lastVercel.action.replace("domain.", "")}
                {typeof lastVercelMeta.status === "number" && (
                  <> · status {String(lastVercelMeta.status)}</>
                )}
                {typeof lastVercelMeta.error === "string" &&
                  lastVercelMeta.error && (
                    <span className="text-rose-500">
                      {" "}
                      · {lastVercelMeta.error}
                    </span>
                  )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* DNS instructions */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">
          DNS records the customer must add
        </h2>
        <p className="mt-1 text-xs text-muted">
          These two records must resolve before you can attach the domain to
          Vercel. Both are checked on demand using the Verify buttons above.
        </p>

        <div className="mt-4 space-y-3">
          <RecordCard
            kind="TXT"
            host={txtRecordName}
            value={row.txt_token}
            note="Proves ownership."
          />
          <RecordCard
            kind="CNAME"
            host={row.domain}
            value={cnameTarget}
            note="Routes traffic to Vercel."
          />
        </div>
      </section>
    </div>
  );
}

function StatusCell({
  label,
  ok,
  at,
}: {
  label: string;
  ok: boolean;
  at: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-app bg-app p-3">
      <CheckMark ok={ok} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-app">{label}</div>
        <div className="font-mono text-[11px] text-muted">
          {at ? formatDateTime(at) : "not yet"}
        </div>
      </div>
    </div>
  );
}

function RecordCard({
  kind,
  host,
  value,
  note,
}: {
  kind: "TXT" | "CNAME";
  host: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-app bg-app p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-tool-accent-soft px-2 py-0.5 font-medium text-tool-accent">
          {kind}
        </span>
        <span className="text-muted">{note}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[80px_1fr]">
        <dt className="uppercase tracking-wide text-muted">Host</dt>
        <dd className="font-mono break-all text-app">{host}</dd>
        <dt className="uppercase tracking-wide text-muted">Value</dt>
        <dd className="font-mono break-all text-app">{value}</dd>
      </dl>
    </div>
  );
}
