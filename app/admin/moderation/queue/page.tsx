import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import { approveItem, escalateItem, rejectItem } from "../_actions";
import {
  ACTION_CHIP_COLORS,
  ACTION_LABELS,
  APPLIES_TO_CHIP_COLORS,
  APPLIES_TO_LABELS,
  QUEUE_STATUS_CHIP_COLORS,
  QUEUE_STATUSES,
  RULE_KIND_LABELS,
  severityStars,
  severityToneClass,
  type QueueStatus,
} from "../_helpers";

import type {
  ModerationQueueRow,
  ModerationRuleRow,
} from "../../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  status?: string;
  source?: string;
  rule_id?: string;
  sev_min?: string;
  sev_max?: string;
  page?: string;
};

export default async function AdminModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const status = (QUEUE_STATUSES as readonly string[]).includes(
    sp.status ?? ""
  )
    ? (sp.status as QueueStatus)
    : "pending";
  const source = (sp.source ?? "").trim();
  const ruleId = (sp.rule_id ?? "").trim();
  const sevMin = clampInt(sp.sev_min, 1, 5, 1);
  const sevMax = clampInt(sp.sev_max, 1, 5, 5);
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PER_PAGE;

  const admin = createAdminClient();

  let q = admin
    .from("moderation_queue")
    .select("*", { count: "exact" })
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  q = q.eq("status", status);
  if (source) q = q.eq("source", source);
  if (ruleId) q = q.eq("rule_id", ruleId);
  q = q.gte("severity", sevMin).lte("severity", sevMax);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ModerationQueueRow[];

  // Pull joined rules for the rows we have.
  const ruleIds = Array.from(
    new Set(
      rows
        .map((r) => r.rule_id)
        .filter((rid): rid is string => Boolean(rid))
    )
  );
  let ruleMap = new Map<string, ModerationRuleRow>();
  if (ruleIds.length > 0) {
    const { data: ruleData } = await admin
      .from("moderation_rules")
      .select("*")
      .in("id", ruleIds);
    for (const r of (ruleData ?? []) as ModerationRuleRow[]) {
      ruleMap.set(r.id, r);
    }
  }

  // User email lookup.
  const userIds = Array.from(
    new Set(
      rows.map((r) => r.user_id).filter((u): u is string => Boolean(u))
    )
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  // Status counts (small fan-out, all small).
  const counts = await Promise.all(
    QUEUE_STATUSES.map(async (s) => {
      const { count: c } = await admin
        .from("moderation_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      return { status: s, count: c ?? 0 };
    })
  );

  // Distinct sources (for filter dropdown).
  const { data: srcData } = await admin
    .from("moderation_queue")
    .select("source")
    .order("source", { ascending: true })
    .limit(1000);
  const sources = Array.from(
    new Set(
      ((srcData ?? []) as { source: string }[])
        .map((s) => s.source)
        .filter(Boolean)
    )
  );

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/moderation"
            className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
          >
            ← Moderation rules
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Moderation queue
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Pending content awaiting human review. Approve to release,
            reject to suppress, escalate to flag for senior review.
          </p>
        </div>
      </div>

      {/* Status counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((c) => {
          const params = new URLSearchParams();
          params.set("status", c.status);
          if (source) params.set("source", source);
          if (ruleId) params.set("rule_id", ruleId);
          if (sevMin !== 1) params.set("sev_min", String(sevMin));
          if (sevMax !== 5) params.set("sev_max", String(sevMax));
          const isActive = status === c.status;
          return (
            <Link
              key={c.status}
              href={`/admin/moderation/queue?${params.toString()}`}
              className={`rounded-xl border p-4 transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft"
                  : "border-app bg-app-elevated hover:border-tool-accent"
              }`}
            >
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                {c.status}
              </div>
              <div
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  c.status === "pending"
                    ? "text-amber-500"
                    : c.status === "approved"
                      ? "text-emerald-500"
                      : c.status === "rejected"
                        ? "text-rose-500"
                        : "text-tool-accent"
                }`}
              >
                {c.count.toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/moderation/queue"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
      >
        <select
          name="status"
          defaultValue={status}
          className={`${inputClass} h-9`}
        >
          {QUEUE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={source}
          className={`${inputClass} h-9`}
        >
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="sev_min"
          min={1}
          max={5}
          defaultValue={sevMin}
          placeholder="min severity"
          className={`${inputClass} h-9`}
        />
        <input
          type="number"
          name="sev_max"
          min={1}
          max={5}
          defaultValue={sevMax}
          placeholder="max severity"
          className={`${inputClass} h-9`}
        />
        {ruleId && <input type="hidden" name="rule_id" value={ruleId} />}
        <button type="submit" className={buttonGhostClass}>
          Filter
        </button>
      </form>

      {ruleId && (
        <div className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-2 text-xs text-tool-accent">
          Filtered by rule_id:{" "}
          <code className="font-mono">{ruleId.slice(0, 8)}…</code>{" "}
          <Link
            href={`/admin/moderation/queue?status=${status}`}
            className="ml-2 underline"
          >
            clear
          </Link>
        </div>
      )}

      {/* Queue items */}
      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-app bg-app-elevated p-10 text-center text-faint">
            No items match these filters.
          </div>
        ) : (
          rows.map((row) => {
            const rule = row.rule_id ? ruleMap.get(row.rule_id) : null;
            const userEmail = row.user_id
              ? userMap.get(row.user_id)?.email ?? null
              : null;
            return (
              <article
                key={row.id}
                className="rounded-xl border border-app bg-app-elevated p-4"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        QUEUE_STATUS_CHIP_COLORS[row.status]
                      }`}
                    >
                      {row.status}
                    </span>
                    <span className="rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[10px] text-secondary">
                      {row.source}
                    </span>
                    <span
                      className={`font-mono text-xs ${severityToneClass(row.severity)}`}
                      title={`Severity ${row.severity}/5`}
                    >
                      {severityStars(row.severity)}
                    </span>
                    <span className="font-mono text-[10px] text-faint">
                      {formatDateTime(row.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span>
                      user:{" "}
                      <span className="font-mono text-secondary">
                        {userEmail ?? row.user_id?.slice(0, 8) ?? "—"}
                      </span>
                    </span>
                    {row.workspace_id && (
                      <span>
                        ws:{" "}
                        <span className="font-mono text-secondary">
                          {row.workspace_id.slice(0, 8)}
                        </span>
                      </span>
                    )}
                  </div>
                </header>

                {/* Content excerpt */}
                <div className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
                  {row.content || "(empty)"}
                </div>

                {/* Rule reference */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {rule ? (
                    <>
                      <span className="text-muted">Matched rule:</span>
                      <Link
                        href={`/admin/moderation/${rule.id}`}
                        className="font-mono text-tool-accent hover:underline"
                      >
                        {rule.pattern.length > 60
                          ? `${rule.pattern.slice(0, 60)}…`
                          : rule.pattern}
                      </Link>
                      <span className="rounded-full bg-app-elevated px-1.5 py-0.5 text-[10px] text-secondary">
                        {RULE_KIND_LABELS[rule.rule_kind]}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          ACTION_CHIP_COLORS[rule.action]
                        }`}
                      >
                        {ACTION_LABELS[rule.action]}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          APPLIES_TO_CHIP_COLORS[rule.applies_to]
                        }`}
                      >
                        {APPLIES_TO_LABELS[rule.applies_to]}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint">
                      No rule attached (manual queue entry).
                    </span>
                  )}
                </div>

                {/* Existing reviewer note */}
                {row.notes && (
                  <div className="mt-2 rounded-md border border-app bg-app px-3 py-2 text-xs text-secondary">
                    <span className="font-semibold text-app">Notes:</span>{" "}
                    {row.notes}
                  </div>
                )}

                {/* Actions */}
                {row.status === "pending" || row.status === "escalated" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ActionForm
                      action={approveItem}
                      id={row.id}
                      label="Approve"
                      tone="emerald"
                    />
                    <ActionForm
                      action={rejectItem}
                      id={row.id}
                      label="Reject"
                      tone="rose"
                    />
                    {row.status === "pending" && (
                      <ActionForm
                        action={escalateItem}
                        id={row.id}
                        label="Escalate"
                        tone="violet"
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-faint">
                    Reviewed{" "}
                    {row.reviewed_at ? formatDateTime(row.reviewed_at) : "—"}
                    {row.reviewed_by ? ` by ${row.reviewed_by.slice(0, 8)}` : ""}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} items
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(sp, page - 1)}
                className={buttonGhostClass}
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageHref(sp, page + 1)}
                className={buttonGhostClass}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionForm({
  action,
  id,
  label,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  tone: "emerald" | "rose" | "violet";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
      : tone === "rose"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
        : "border-tool-accent/40 bg-tool-accent-soft text-tool-accent hover:opacity-80";
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="notes"
        placeholder="Notes (optional)"
        className={`${inputClass} h-8 w-48 text-xs`}
      />
      <button
        type="submit"
        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${toneClass}`}
      >
        {label}
      </button>
    </form>
  );
}

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function buildPageHref(sp: SearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.source) params.set("source", sp.source);
  if (sp.rule_id) params.set("rule_id", sp.rule_id);
  if (sp.sev_min) params.set("sev_min", sp.sev_min);
  if (sp.sev_max) params.set("sev_max", sp.sev_max);
  params.set("page", String(page));
  return `/admin/moderation/queue?${params.toString()}`;
}
