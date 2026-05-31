"use client";

/* Broadcasts panel (EPIC-08) — segmented + scheduled + personalized blasts.
 *
 * Lazy-loaded (next/dynamic) from the Broadcasts tab so this heavier panel
 * never inflates the initial WhatsApp bundle (Vercel 8GB build ceiling).
 *
 * Three sub-views, all mobile-first (responsive CSS only — no device branch):
 *   1. Broadcasts list   — recent blasts + status + per-broadcast analytics drawer.
 *   2. New broadcast      — pick audience (saved segment) → compose ({{var}} +
 *                           variants) → send now or schedule → optional recurrence.
 *   3. Segments manager   — create/edit dynamic audiences (labels + lifecycle +
 *                           last-contacted + consent-only), with a live recipient
 *                           count preview.
 *
 * Anti-ban guardrails are server-side (throttle + opt-out suppression in the
 * runner); the UI surfaces an estimate + a consent reminder.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBroadcast,
  createSegment,
  deleteSegment,
  fetchBroadcastDetail,
  fetchBroadcasts,
  fetchLabels,
  fetchSegments,
  patchBroadcast,
  previewSegmentCount,
  updateSegment,
  type WaBroadcast,
  type WaBroadcastAnalytics,
  type WaBroadcastRecipient,
  type WaLabel,
  type WaSegment,
  type WaSegmentQuery,
} from "./api";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

type View = "list" | "new" | "segments";

const STATUS_TONE: Record<
  WaBroadcast["status"],
  "success" | "warn" | "danger" | "info" | "neutral"
> = {
  queued: "neutral",
  running: "info",
  paused: "warn",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export default function BroadcastsPanel({ workspaceId, compact }: Props) {
  const [view, setView] = useState<View>("list");

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center gap-1 border-b border-app bg-app-elevated px-3 py-2">
        {(
          [
            ["list", "Broadcasts"],
            ["new", "New broadcast"],
            ["segments", "Segments"],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
              view === key
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:bg-surface hover:text-app"
            }`}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "list" ? (
          <BroadcastList workspaceId={workspaceId} compact={compact} />
        ) : view === "new" ? (
          <NewBroadcast
            workspaceId={workspaceId}
            onDone={() => setView("list")}
            onManageSegments={() => setView("segments")}
          />
        ) : (
          <SegmentsManager workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Broadcast list + analytics ───────────────────────── */

function BroadcastList({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<WaBroadcast | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetchBroadcasts(workspaceId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setItems(res.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    const active = items.some(
      (b) => b.status === "queued" || b.status === "running",
    );
    const id = setInterval(refresh, active ? 12_000 : 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, items.length]);

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;
  if (error)
    return (
      <div className="p-3">
        <ErrorBlock body={error} onRetry={refresh} />
      </div>
    );
  if (items.length === 0)
    return (
      <EmptyState
        kicker="whatsapp.broadcasts"
        compact={compact}
        title="No broadcasts yet"
        body={
          <span>
            Send a segmented, personalized blast through the anti-ban runner.
            Every send respects opt-out and the warm-up throttle.
          </span>
        }
      />
    );

  return (
    <>
      <ul role="list" className="divide-y divide-app">
        {items.map((b) => {
          const pct =
            b.total_contacts > 0
              ? Math.round((b.sent_count / b.total_contacts) * 100)
              : 0;
          return (
            <li key={b.id} className="px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-app">
                      {b.title || b.segment_name || "Broadcast"}
                    </span>
                    <Pill tone={STATUS_TONE[b.status]}>{b.status}</Pill>
                    {b.scheduled_for &&
                    (b.status === "queued" || b.status === "paused") ? (
                      <span className="font-mono text-[0.6rem] text-faint">
                        scheduled {formatRelative(b.scheduled_for)}
                      </span>
                    ) : null}
                    {b.recurrence ? (
                      <Pill tone="info">
                        <MiniIcon name="refresh" size={10} /> recurring
                      </Pill>
                    ) : null}
                  </div>
                  {b.message_template ? (
                    <div className="mt-1 line-clamp-1 text-xs text-secondary">
                      {b.personalization_template || b.message_template}
                    </div>
                  ) : null}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[0.6rem] text-faint">
                    {b.sent_count}/{b.total_contacts} sent
                    {b.failed_count ? ` · ${b.failed_count} failed` : ""} ·{" "}
                    {formatRelative(b.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawer(b)}
                  className="shrink-0 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-tool-accent hover:underline"
                >
                  Details
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {drawer ? (
        <BroadcastDrawer
          workspaceId={workspaceId}
          broadcast={drawer}
          onClose={() => setDrawer(null)}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}

function BroadcastDrawer({
  workspaceId,
  broadcast,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  broadcast: WaBroadcast;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [analytics, setAnalytics] = useState<WaBroadcastAnalytics | null>(null);
  const [recipients, setRecipients] = useState<WaBroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchBroadcastDetail(workspaceId, broadcast.id);
    setLoading(false);
    if (res.ok) {
      setAnalytics(res.data.analytics);
      setRecipients(res.data.recipients);
    }
  }, [workspaceId, broadcast.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: "pause" | "resume" | "cancel" | "resend_failed") => {
      setBusy(true);
      const res = await patchBroadcast(workspaceId, broadcast.id, action);
      setBusy(false);
      if (res.ok) {
        await load();
        onChanged();
      }
    },
    [workspaceId, broadcast.id, load, onChanged],
  );

  const stat = (label: string, value: number, tone?: string) => (
    <div className="rounded-md border border-app bg-surface px-2 py-1.5 text-center">
      <div className={`text-base font-semibold ${tone ?? "text-app"}`}>
        {value}
      </div>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-app px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-app">
              {broadcast.title || broadcast.segment_name || "Broadcast"}
            </h3>
            <div className="mt-0.5 flex items-center gap-2">
              <Pill tone={STATUS_TONE[broadcast.status]}>
                {broadcast.status}
              </Pill>
              <span className="text-[0.65rem] text-faint">
                {formatRelative(broadcast.created_at)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-secondary hover:bg-surface"
            aria-label="Close"
          >
            <MiniIcon name="close" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-xs text-faint">loading analytics…</div>
          ) : (
            <>
              {analytics ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {stat("Sent", analytics.sent)}
                  {stat("Delivered", analytics.delivered, "text-tool-accent")}
                  {stat(
                    "Read",
                    analytics.read,
                    "text-emerald-600 dark:text-emerald-300",
                  )}
                  {stat(
                    "Replied",
                    analytics.replied,
                    "text-emerald-600 dark:text-emerald-300",
                  )}
                  {stat(
                    "Failed",
                    analytics.failed,
                    "text-rose-600 dark:text-rose-300",
                  )}
                  {stat("Pending", analytics.pending, "text-faint")}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {broadcast.status === "running" ? (
                  <SecondaryButton onClick={() => act("pause")} disabled={busy}>
                    <MiniIcon name="pause" /> Pause
                  </SecondaryButton>
                ) : null}
                {broadcast.status === "paused" ? (
                  <PrimaryButton onClick={() => act("resume")} loading={busy}>
                    <MiniIcon name="play" /> Resume
                  </PrimaryButton>
                ) : null}
                {analytics && analytics.failed > 0 ? (
                  <SecondaryButton
                    onClick={() => act("resend_failed")}
                    disabled={busy}
                  >
                    <MiniIcon name="refresh" /> Resend to {analytics.failed}{" "}
                    failed
                  </SecondaryButton>
                ) : null}
                {broadcast.status === "queued" ||
                broadcast.status === "running" ||
                broadcast.status === "paused" ? (
                  <DangerButton onClick={() => act("cancel")} disabled={busy}>
                    <MiniIcon name="stop" /> Cancel
                  </DangerButton>
                ) : null}
              </div>

              <h4 className="mt-4 mb-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Recipients · {recipients.length}
              </h4>
              <ul role="list" className="divide-y divide-app">
                {recipients.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="truncate text-app">
                        {r.contact_name || r.to_number || "—"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {r.replied ? <Pill tone="success">replied</Pill> : null}
                      <Pill
                        tone={
                          r.status === "failed"
                            ? "danger"
                            : r.status === "read" || r.status === "delivered"
                              ? "success"
                              : "info"
                        }
                      >
                        {r.status}
                      </Pill>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── New broadcast composer ───────────────────────── */

function NewBroadcast({
  workspaceId,
  onDone,
  onManageSegments,
}: {
  workspaceId: string;
  onDone: () => void;
  onManageSegments: () => void;
}) {
  const [segments, setSegments] = useState<WaSegment[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recur, setRecur] = useState<"none" | "daily" | "weekly" | "monthly">(
    "none",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetchSegments(workspaceId);
      if (res.ok) setSegments(res.data);
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!segmentId) {
      setCount(null);
      return;
    }
    void (async () => {
      const res = await previewSegmentCount(workspaceId, { id: segmentId });
      if (res.ok) setCount(res.data.count);
    })();
  }, [workspaceId, segmentId]);

  const submit = useCallback(async () => {
    setError(null);
    if (!segmentId) {
      setError("Pick an audience segment.");
      return;
    }
    if (!message.trim()) {
      setError("Write a message.");
      return;
    }
    if (scheduleMode === "later" && !scheduledFor) {
      setError("Pick a send time.");
      return;
    }
    setBusy(true);
    const res = await createBroadcast(workspaceId, {
      segment_id: segmentId,
      personalization_template: message.trim(),
      ...(scheduleMode === "later"
        ? { scheduled_for: new Date(scheduledFor).toISOString() }
        : {}),
      ...(recur !== "none" ? { recurrence: { freq: recur, interval: 1 } } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setTimeout(onDone, 1200);
  }, [workspaceId, segmentId, message, scheduleMode, scheduledFor, recur, onDone]);

  if (done)
    return (
      <div className="p-6">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-200">
          <div className="font-semibold">Broadcast queued</div>
          <p className="mt-1 text-xs opacity-90">
            The runner will drain it under the anti-ban throttle (50/hr,
            200/day). Opted-out contacts are skipped automatically.
          </p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <div>
        <label className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Audience (segment)
        </label>
        {segments.length === 0 ? (
          <div className="mt-1 rounded-md border border-app bg-surface p-3 text-xs text-secondary">
            No segments yet.{" "}
            <button
              type="button"
              onClick={onManageSegments}
              className="font-medium text-tool-accent hover:underline"
            >
              Create one
            </button>{" "}
            to target by label, lifecycle, or last-contacted.
          </div>
        ) : (
          <select
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          >
            <option value="">Select a segment…</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {count !== null ? (
          <div className="mt-1 text-[0.65rem] text-faint">
            ≈ {count} recipient{count === 1 ? "" : "s"} (resolved now; opted-out
            excluded at send time)
          </div>
        ) : null}
      </div>

      <div>
        <label className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Message · {"{{contact.firstName}}"} {"{{city}}"} supported
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Assalam o Alaikum {{contact.firstName}}! New arrivals just dropped 🧵 Reply STOP to opt out."
          className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
        <div className="mt-1 text-[0.6rem] text-faint">
          Tip: include a STOP hint. Unknown {"{{vars}}"} render as blank, never
          literal.
        </div>
      </div>

      <div>
        <label className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          When
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScheduleMode("now")}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              scheduleMode === "now"
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app text-secondary hover:bg-surface"
            }`}
          >
            Send now
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode("later")}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              scheduleMode === "later"
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app text-secondary hover:bg-surface"
            }`}
          >
            Schedule
          </button>
          {scheduleMode === "later" ? (
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
            />
          ) : null}
        </div>
      </div>

      <div>
        <label className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Repeat
        </label>
        <select
          value={recur}
          onChange={(e) =>
            setRecur(e.target.value as "none" | "daily" | "weekly" | "monthly")
          }
          className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        >
          <option value="none">One-time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {error ? <ErrorBlock body={error} /> : null}

      <div className="flex items-center justify-end gap-2">
        <SecondaryButton onClick={onDone}>Cancel</SecondaryButton>
        <PrimaryButton onClick={submit} loading={busy}>
          {scheduleMode === "later" ? "Schedule broadcast" : "Queue broadcast"}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ───────────────────────── Segments manager ───────────────────────── */

const LIFECYCLE_OPTIONS = ["lead", "prospect", "customer", "vip", "lapsed"];

function SegmentsManager({ workspaceId }: { workspaceId: string }) {
  const [segments, setSegments] = useState<WaSegment[]>([]);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaSegment | "new" | null>(null);

  const refresh = useCallback(async () => {
    const [segRes, labelRes] = await Promise.all([
      fetchSegments(workspaceId),
      fetchLabels(workspaceId),
    ]);
    setLoading(false);
    if (segRes.ok) setSegments(segRes.data);
    else setError(segRes.error);
    if (labelRes.ok) setLabels(labelRes.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (s: WaSegment) => {
      if (!confirm(`Delete segment "${s.name}"?`)) return;
      const res = await deleteSegment(workspaceId, s.id);
      if (res.ok) await refresh();
    },
    [workspaceId, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Segments · {segments.length}
        </h3>
        <PrimaryButton onClick={() => setEditing("new")}>
          <MiniIcon name="plus" /> New segment
        </PrimaryButton>
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {segments.length === 0 && !editing ? (
        <EmptyState
          kicker="whatsapp.segments"
          title="No segments yet"
          body={
            <span>
              A segment is a live audience (e.g. &ldquo;Wholesale, contacted 30+
              days ago&rdquo;) resolved fresh on every blast.
            </span>
          }
        />
      ) : (
        <ul role="list" className="space-y-2">
          {segments.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-app bg-surface px-3 py-2"
            >
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm font-medium text-app">
                  {s.name}
                </div>
                <div className="truncate text-[0.65rem] text-faint">
                  {summarizeQuery(s.query, labels)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                aria-label="Delete segment"
              >
                <MiniIcon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <SegmentEditor
          workspaceId={workspaceId}
          labels={labels}
          segment={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function summarizeQuery(q: WaSegmentQuery, labels: WaLabel[]): string {
  const parts: string[] = [];
  if (q.labels?.length) {
    const names = q.labels
      .map((id) => labels.find((l) => l.id === id)?.title ?? "label")
      .join(", ");
    parts.push(`labels: ${names}`);
  }
  if (q.lifecycle?.length) parts.push(`lifecycle: ${q.lifecycle.join("/")}`);
  if (q.last_contacted)
    parts.push(
      q.last_contacted.op === "never"
        ? "never contacted"
        : `contacted ${q.last_contacted.op} ${q.last_contacted.days ?? 30}d`,
    );
  if (q.consent_only) parts.push("consented only");
  return parts.length ? parts.join(" · ") : "all contacts with a phone";
}

function SegmentEditor({
  workspaceId,
  labels,
  segment,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  labels: WaLabel[];
  segment: WaSegment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? "");
  const [selLabels, setSelLabels] = useState<string[]>(
    segment?.query.labels ?? [],
  );
  const [lifecycle, setLifecycle] = useState<string[]>(
    segment?.query.lifecycle ?? [],
  );
  const [lastOp, setLastOp] = useState<"" | "before" | "after" | "never">(
    segment?.query.last_contacted?.op ?? "",
  );
  const [lastDays, setLastDays] = useState(
    String(segment?.query.last_contacted?.days ?? 30),
  );
  const [consentOnly, setConsentOnly] = useState(
    segment?.query.consent_only ?? false,
  );
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<WaSegmentQuery>(() => {
    const q: WaSegmentQuery = {};
    if (selLabels.length) q.labels = selLabels;
    if (lifecycle.length) q.lifecycle = lifecycle;
    if (lastOp)
      q.last_contacted =
        lastOp === "never"
          ? { op: "never" }
          : { op: lastOp, days: Number(lastDays) || 30 };
    if (consentOnly) q.consent_only = true;
    return q;
  }, [selLabels, lifecycle, lastOp, lastDays, consentOnly]);

  const preview = useCallback(async () => {
    const res = await previewSegmentCount(workspaceId, { query });
    if (res.ok) setCount(res.data.count);
  }, [workspaceId, query]);

  useEffect(() => {
    void preview();
  }, [preview]);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    const res = segment
      ? await updateSegment(workspaceId, segment.id, { name: name.trim(), query })
      : await createSegment(workspaceId, { name: name.trim(), query });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [workspaceId, segment, name, query, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <h3 className="text-base font-semibold text-app">
            {segment ? "Edit segment" : "New segment"}
          </h3>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wholesale buyers"
              className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </label>

          {labels.length > 0 ? (
            <div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Has labels (all)
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggle(selLabels, l.id, setSelLabels)}
                    className={`rounded-full border px-2 py-0.5 text-[0.65rem] ${
                      selLabels.includes(l.id)
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app text-secondary hover:bg-surface"
                    }`}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              Lifecycle stage
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {LIFECYCLE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(lifecycle, s, setLifecycle)}
                  className={`rounded-full border px-2 py-0.5 text-[0.65rem] capitalize ${
                    lifecycle.includes(s)
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app text-secondary hover:bg-surface"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              Last contacted
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={lastOp}
                onChange={(e) =>
                  setLastOp(e.target.value as "" | "before" | "after" | "never")
                }
                className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
              >
                <option value="">any time</option>
                <option value="before">more than</option>
                <option value="after">within</option>
                <option value="never">never contacted</option>
              </select>
              {lastOp === "before" || lastOp === "after" ? (
                <>
                  <input
                    type="number"
                    min={1}
                    value={lastDays}
                    onChange={(e) => setLastDays(e.target.value)}
                    className="w-16 rounded-md border border-app bg-surface px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
                  />
                  <span className="text-xs text-secondary">days ago</span>
                </>
              ) : null}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={consentOnly}
              onChange={(e) => setConsentOnly(e.target.checked)}
            />
            Only contacts who granted marketing consent
          </label>

          <div className="rounded-md border border-app bg-surface px-3 py-2 text-xs text-secondary">
            ≈ <span className="font-semibold text-app">{count ?? "…"}</span>{" "}
            recipients match (opted-out always excluded at send time)
          </div>

          {error ? <ErrorBlock body={error} /> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-app px-4 py-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} loading={busy}>
            {segment ? "Save" : "Create segment"}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}
