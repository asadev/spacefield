"use client";

/* Jobs tab — in-flight + recent bulk send jobs.
 *
 * Polls every 10s while there's at least one job in 'queued' or 'running'
 * to keep progress bars live. Pause/resume/cancel call PATCH on the API. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchJobLog,
  fetchJobs,
  patchJob,
  type WaJob,
  type WaJobLogEntry,
} from "./api";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatPhone,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

const STATUS_TONE: Record<WaJob["status"], "success" | "warn" | "danger" | "info" | "neutral"> = {
  queued: "neutral",
  running: "info",
  paused: "warn",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 30_000;

export default function JobsTab({ workspaceId, compact }: Props) {
  const [jobs, setJobs] = useState<WaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<WaJob | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetchJobs(workspaceId);
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setJobs(res.data);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    let alive = true;
    void refresh();
    let handle: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const active = jobs.some((j) => j.status === "queued" || j.status === "running");
      const interval = active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      handle = setTimeout(async () => {
        if (!alive) return;
        await refresh();
        tick();
      }, interval);
    };
    tick();
    return () => {
      alive = false;
      if (handle) clearTimeout(handle);
    };
  }, [jobs, refresh]);

  const handleAction = useCallback(
    async (job: WaJob, action: "pause" | "resume" | "cancel") => {
      setActionBusy(job.id);
      setError(null);
      const res = await patchJob(job.id, { action });
      setActionBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJobs((prev) => prev.map((j) => (j.id === job.id ? res.data : j)));
    },
    []
  );

  const sorted = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        // Active jobs first, then by created_at desc
        const aActive = a.status === "running" || a.status === "queued";
        const bActive = b.status === "running" || b.status === "queued";
        if (aActive !== bActive) return aActive ? -1 : 1;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      }),
    [jobs]
  );

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Send jobs · {jobs.length}
        </h3>
        <SecondaryButton onClick={refresh} disabled={loading}>
          <MiniIcon name="refresh" /> Refresh
        </SecondaryButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-faint">loading…</div>
        ) : error ? (
          <div className="p-3">
            <ErrorBlock body={error} onRetry={refresh} />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            kicker="whatsapp.jobs"
            compact={compact}
            title="No jobs yet"
            body={
              <span>
                Bulk sends to a list or group queue here so you can pause, resume,
                or cancel mid-blast.
              </span>
            }
          />
        ) : (
          <ul role="list" className="divide-y divide-app">
            {sorted.map((j) => (
              <li key={j.id} className="px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-app">
                        {j.target_name ?? `${j.target_type}: ${j.target_id.slice(0, 16)}…`}
                      </span>
                      <Pill tone={STATUS_TONE[j.status]}>{j.status}</Pill>
                      <span className="font-mono text-[0.6rem] text-faint">
                        {j.target_type}
                      </span>
                    </div>
                    {j.message ? (
                      <div className="mt-1 line-clamp-1 text-xs text-secondary">
                        {j.message}
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <ProgressBar
                        sent={j.sent_count}
                        total={j.total_contacts}
                        failed={j.failed_count ?? 0}
                      />
                      <div className="mt-1 flex items-center justify-between text-[0.6rem] text-faint">
                        <span>
                          {j.sent_count}/{j.total_contacts} sent
                          {j.failed_count ? ` · ${j.failed_count} failed` : ""}
                        </span>
                        <span>
                          {j.estimated_finish_at && j.status === "running"
                            ? `eta ${formatRelative(j.estimated_finish_at)}`
                            : j.finished_at
                            ? `done ${formatRelative(j.finished_at)}`
                            : `started ${formatRelative(j.started_at ?? j.created_at)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <JobActions
                      job={j}
                      busy={actionBusy === j.id}
                      onAction={handleAction}
                    />
                    <button
                      type="button"
                      onClick={() => setDrawer(j)}
                      className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent hover:underline"
                    >
                      View log
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {drawer ? (
        <JobLogDrawer
          workspaceId={workspaceId}
          job={drawer}
          onClose={() => setDrawer(null)}
        />
      ) : null}
    </div>
  );
}

function ProgressBar({
  sent,
  total,
  failed,
}: {
  sent: number;
  total: number;
  failed: number;
}) {
  const denom = Math.max(1, total);
  const sentPct = Math.min(100, Math.round((sent / denom) * 100));
  const failedPct = Math.min(100 - sentPct, Math.round((failed / denom) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div className="flex h-full">
        <div className="bg-emerald-500" style={{ width: `${sentPct}%` }} />
        <div className="bg-rose-500" style={{ width: `${failedPct}%` }} />
      </div>
    </div>
  );
}

function JobActions({
  job,
  busy,
  onAction,
}: {
  job: WaJob;
  busy: boolean;
  onAction: (job: WaJob, action: "pause" | "resume" | "cancel") => void;
}) {
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5">
      {job.status === "running" ? (
        <SecondaryButton onClick={() => onAction(job, "pause")} disabled={busy}>
          <MiniIcon name="pause" /> Pause
        </SecondaryButton>
      ) : null}
      {job.status === "paused" ? (
        <PrimaryButton onClick={() => onAction(job, "resume")} loading={busy}>
          <MiniIcon name="play" /> Resume
        </PrimaryButton>
      ) : null}
      <DangerButton onClick={() => onAction(job, "cancel")} disabled={busy}>
        <MiniIcon name="stop" /> Cancel
      </DangerButton>
    </div>
  );
}

function JobLogDrawer({
  workspaceId,
  job,
  onClose,
}: {
  workspaceId: string;
  job: WaJob;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<WaJobLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJobLog(workspaceId, job.id);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEntries(res.data);
  }, [job.id, workspaceId]);

  useEffect(() => {
    void refresh();
    // Poll while job is active
    if (job.status !== "running" && job.status !== "queued") return;
    const id = setInterval(refresh, ACTIVE_POLL_MS);
    return () => clearInterval(id);
  }, [job.status, refresh]);

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
        <header className="shrink-0 border-b border-app px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-app">
                {job.target_name ?? `Job ${job.id.slice(0, 8)}`}
              </h3>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-secondary">
                <Pill tone={STATUS_TONE[job.status]}>{job.status}</Pill>
                <span>
                  {job.sent_count}/{job.total_contacts}
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
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-xs text-faint">loading…</div>
          ) : error ? (
            <ErrorBlock body={error} onRetry={refresh} />
          ) : entries.length === 0 ? (
            <div className="text-xs text-faint">No log entries yet.</div>
          ) : (
            <ul role="list" className="divide-y divide-app">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-app">
                      {e.contact_name ?? "—"}
                    </div>
                    <div className="truncate font-mono text-[0.65rem] text-faint">
                      {formatPhone(e.contact_phone)}
                    </div>
                    {e.error_message ? (
                      <div className="mt-0.5 text-[0.65rem] text-rose-600 dark:text-rose-300">
                        {e.error_message}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-[0.65rem]">
                    <Pill
                      tone={
                        e.status === "failed"
                          ? "danger"
                          : e.status === "delivered" || e.status === "read"
                          ? "success"
                          : e.status === "sent"
                          ? "info"
                          : "neutral"
                      }
                    >
                      {e.status}
                    </Pill>
                    <div className="mt-1 text-faint">{formatRelative(e.sent_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
