import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import {
  approveDeletion,
  deleteRequest,
  markFailed,
  markReady,
  runRequest,
  updateRequest,
} from "../_actions";
import {
  DEFAULT_EXPIRY_DAYS,
  EXPORT_KIND_CHIP_COLORS,
  EXPORT_KIND_HINTS,
  EXPORT_KIND_LABELS,
  EXPORT_KINDS,
  EXPORT_STATUS_CHIP_COLORS,
} from "../_helpers";

import type { DataExportRequestRow } from "../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminDataExportDetailPage({ params }: PageProps) {
  const { id } = await params;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();
  if (error) throw new Error(error.message);
  const row = data;
  if (!row) notFound();

  const userEmail = row.user_id
    ? (await fetchAuthUsersByIds([row.user_id])).get(row.user_id)?.email ?? null
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/data-exports"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Data exports
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-base font-semibold text-app">
            {row.id.slice(0, 8)}…
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              EXPORT_KIND_CHIP_COLORS[row.kind]
            }`}
          >
            {EXPORT_KIND_LABELS[row.kind]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              EXPORT_STATUS_CHIP_COLORS[row.status]
            }`}
          >
            {row.status}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            user{" "}
            <span className="font-mono text-secondary">
              {userEmail ?? row.user_id?.slice(0, 8) ?? "—"}
            </span>
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(row.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            finished {formatDateTime(row.finished_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            expires {formatDateTime(row.expires_at)}
          </span>
        </div>
      </div>

      {/* State machine controls */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">State machine</h2>
        <p className="mt-1 text-xs text-muted">
          The actual export job is environmental. These buttons stamp the
          status machine + audit log.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Run / Approve */}
          {row.status === "pending" && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="text-xs font-semibold text-blue-500">
                {row.kind === "deletion"
                  ? "Approve deletion"
                  : "Start export"}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {row.kind === "deletion"
                  ? "Records the admin signed off on the user-deletion job. The actual deletion runs out-of-band."
                  : "Records the export job has been kicked off. Move to ready when the file is uploaded."}
              </p>
              <form
                action={
                  row.kind === "deletion" ? approveDeletion : runRequest
                }
                className="mt-3"
              >
                <input type="hidden" name="id" value={row.id} />
                <button
                  type="submit"
                  className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-500/20"
                >
                  {row.kind === "deletion" ? "Approve deletion" : "Start"}
                </button>
              </form>
            </div>
          )}

          {/* Mark ready */}
          {(row.status === "running" || row.status === "pending") &&
            row.kind !== "deletion" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="text-xs font-semibold text-emerald-500">
                  Mark ready
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Stamps a download URL and expiry. If you leave the URL
                  blank a placeholder is set so the row reads cleanly.
                </p>
                <form action={markReady} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input
                    type="url"
                    name="download_url"
                    placeholder="https://exports.spacefield.local/..."
                    className={`${inputClass} h-8 text-xs`}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name="expiry_days"
                      defaultValue={DEFAULT_EXPIRY_DAYS}
                      min={1}
                      max={90}
                      className={`${inputClass} h-8 w-24 text-xs`}
                    />
                    <span className="text-[11px] text-muted">
                      days until expiry
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
                  >
                    Mark ready
                  </button>
                </form>
              </div>
            )}

          {/* Mark failed */}
          {(row.status === "running" || row.status === "pending") && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
              <div className="text-xs font-semibold text-rose-500">
                Mark failed
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Surface the failure to the user via support. Does not
                delete the request — `notes` should explain the reason.
              </p>
              <form action={markFailed} className="mt-3">
                <input type="hidden" name="id" value={row.id} />
                <button
                  type="submit"
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                >
                  Mark failed
                </button>
              </form>
            </div>
          )}

          {row.status === "ready" && row.download_url && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 md:col-span-2">
              <div className="text-xs font-semibold text-emerald-500">
                Download URL
              </div>
              <div className="mt-2 break-all rounded-md border border-app bg-app px-3 py-2 font-mono text-[11px] text-app">
                {row.download_url}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Editor */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit request</h2>

        <form action={updateRequest} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={row.id} />
          {row.user_id && (
            <input type="hidden" name="user_id" value={row.user_id} />
          )}

          <Field
            label="Kind"
            hint={EXPORT_KIND_HINTS[row.kind]}
          >
            <select
              name="kind"
              defaultValue={row.kind}
              className={inputClass}
            >
              {EXPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EXPORT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="User"
            hint="To re-bind this request to a different user, delete and re-create from /admin/data-exports/new."
          >
            <input
              type="text"
              defaultValue={
                row.user_id
                  ? `${userEmail ?? "(no email)"} — ${row.user_id}`
                  : "—"
              }
              disabled
              className={`${inputClass} font-mono text-xs opacity-70`}
            />
          </Field>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={row.notes ?? ""}
              rows={6}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
            <Link href="/admin/data-exports" className={buttonGhostClass}>
              Back to requests
            </Link>
          </div>
        </form>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this request row. If the export file already
          exists it should be deleted from object storage separately.
        </p>
        <form action={deleteRequest} className="mt-3">
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete request
          </button>
        </form>
      </section>
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
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
