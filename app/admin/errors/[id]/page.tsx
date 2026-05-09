import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
} from "../../_lib";
import { LEVEL_CHIP_CLASS } from "../_helpers";

import { resolveByFingerprint, resolveSingleAction } from "./_actions";

import type { ErrorEventRow, ErrorLevel } from "../../_types";

export const dynamic = "force-dynamic";

/**
 * Per-error detail page. Renders the full row including stack & context
 * pretty-printed, with actions to resolve this single event or every
 * event sharing the same fingerprint.
 */
export default async function AdminErrorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("error_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load error: {error.message}
      </div>
    );
  }
  if (!data) notFound();
  const event = data as ErrorEventRow;

  // Resolve user email if there's a user_id, plus the resolver's email.
  const idsToFetch = [event.user_id, event.resolved_by].filter(
    (v): v is string => Boolean(v)
  );
  const userMap = await fetchAuthUsersByIds(idsToFetch);
  const reporterEmail =
    (event.user_id && userMap.get(event.user_id)?.email) || null;
  const resolverEmail =
    (event.resolved_by && userMap.get(event.resolved_by)?.email) || null;

  const fingerprint = event.fingerprint;
  const similarHref = fingerprint
    ? `/admin/errors?fingerprint=${encodeURIComponent(fingerprint)}`
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          <Link
            href="/admin/errors"
            className="hover:text-app transition-colors"
          >
            Errors
          </Link>
          <span aria-hidden>/</span>
          <span>Detail</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start gap-3">
          <span
            className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              LEVEL_CHIP_CLASS[event.level as ErrorLevel] ??
              LEVEL_CHIP_CLASS.error
            }`}
          >
            {event.level}
          </span>
          <h1 className="text-xl font-semibold text-app break-words">
            {event.message || "(empty message)"}
          </h1>
        </div>
        <p className="mt-1 text-xs text-muted">
          Captured {formatDateTime(event.occurred_at)}
          {event.source ? (
            <>
              {" "}
              from{" "}
              <code className="rounded bg-app px-1 text-[11px]">
                {event.source}
              </code>
            </>
          ) : null}
          {event.resolved_at ? (
            <>
              {" "}
              · <span className="text-emerald-500">resolved</span>{" "}
              {formatDateTime(event.resolved_at)}
              {resolverEmail ? <> by {resolverEmail}</> : null}
            </>
          ) : null}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {!event.resolved_at && (
          <form action={resolveSingleAction} className="inline-flex">
            <input type="hidden" name="id" value={event.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Resolve this error
            </button>
          </form>
        )}
        {!event.resolved_at && fingerprint && (
          <form action={resolveByFingerprint} className="inline-flex">
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="fingerprint" value={fingerprint} />
            <button type="submit" className={buttonClass}>
              Resolve fingerprint group
            </button>
          </form>
        )}
        {similarHref && (
          <Link href={similarHref} className={buttonGhostClass}>
            Find similar
          </Link>
        )}
        <Link href="/admin/errors" className={buttonGhostClass}>
          Back to list
        </Link>
      </div>

      {/* Metadata grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Event ID" value={event.id} mono />
        <DetailField
          label="Occurred at"
          value={formatDateTime(event.occurred_at)}
        />
        <DetailField label="Level" value={event.level} />
        <DetailField label="Source" value={event.source} mono />
        <DetailField label="Fingerprint" value={fingerprint} mono />
        <DetailField label="Request ID" value={event.request_id} mono />
        <DetailField label="URL" value={event.url} multiline />
        <DetailField
          label="User"
          value={reporterEmail ?? event.user_id}
          mono
        />
        <DetailField label="Workspace" value={event.workspace_id} mono />
        <DetailField
          label="User-agent"
          value={event.user_agent}
          mono
          multiline
        />
        <DetailField
          label="Resolved"
          value={
            event.resolved_at
              ? `${formatDateTime(event.resolved_at)}${
                  resolverEmail ? ` (${resolverEmail})` : ""
                }`
              : "Open"
          }
        />
      </div>

      {/* Stack */}
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Stack
        </div>
        <pre className="mt-1 max-h-[28rem] overflow-auto rounded-xl border border-app bg-app p-4 font-mono text-[11px] leading-relaxed text-app">
          {event.stack || "(no stack captured)"}
        </pre>
      </div>

      {/* Context */}
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Context
        </div>
        <pre className="mt-1 max-h-[28rem] overflow-auto rounded-xl border border-app bg-app p-4 font-mono text-[11px] leading-relaxed text-app">
          {event.context && Object.keys(event.context).length > 0
            ? JSON.stringify(event.context, null, 2)
            : "(no extra context)"}
        </pre>
      </div>
    </div>
  );
}

/**
 * Single labelled field. `multiline` makes the value wrap; default
 * truncates it.
 */
function DetailField({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated px-3 py-2">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={[
          "mt-0.5",
          mono ? "font-mono text-[11px]" : "text-xs",
          multiline ? "break-all whitespace-pre-wrap" : "truncate",
          value ? "text-app" : "text-faint",
        ].join(" ")}
      >
        {value || "—"}
      </div>
    </div>
  );
}
