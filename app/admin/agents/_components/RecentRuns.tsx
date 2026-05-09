"use client";

import { useMemo, useState } from "react";

import type { AiAgentRunRow } from "../../_types";
import { formatDateTime } from "./_styles";

const STATUS_STYLES: Record<AiAgentRunRow["status"], string> = {
  success: "bg-emerald-500/15 text-emerald-500",
  error: "bg-rose-500/15 text-rose-500",
  denied: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function fmtMs(n: number | null): string {
  if (n == null) return "—";
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function fmtTokens(rin: number | null, rout: number | null): string {
  const a = rin ?? 0;
  const b = rout ?? 0;
  if (a === 0 && b === 0) return "—";
  return `${a.toLocaleString()}→${b.toLocaleString()}`;
}

export default function RecentRuns({
  runs,
  emptyHint,
}: {
  runs: AiAgentRunRow[];
  emptyHint?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, AiAgentRunRow[]>();
    for (const r of runs) {
      const key = dayKey(r.created_at);
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [runs]);

  const [openDay, setOpenDay] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (grouped.length > 0) init[grouped[0][0]] = true;
    return init;
  });
  const [openRun, setOpenRun] = useState<Record<string, boolean>>({});

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
        {emptyHint ?? "No runs yet."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(([day, list]) => {
        const open = openDay[day] ?? false;
        const successCount = list.filter((r) => r.status === "success").length;
        return (
          <div
            key={day}
            className="overflow-hidden rounded-lg border border-app bg-app"
          >
            <button
              type="button"
              onClick={() =>
                setOpenDay((prev) => ({ ...prev, [day]: !prev[day] }))
              }
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-app transition-colors hover:bg-app-elevated"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono tabular-nums">{day}</span>
                <span className="text-faint">·</span>
                <span className="text-muted">
                  {list.length} run{list.length === 1 ? "" : "s"}
                </span>
                <span className="text-faint">·</span>
                <span className="text-emerald-500">
                  {successCount} ok
                </span>
                {successCount < list.length && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="text-rose-500">
                      {list.length - successCount} fail
                    </span>
                  </>
                )}
              </span>
              <span className="text-faint">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <ul className="divide-y divide-app border-t border-app">
                {list.map((r) => {
                  const isOpen = openRun[r.id] ?? false;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRun((prev) => ({
                            ...prev,
                            [r.id]: !prev[r.id],
                          }))
                        }
                        className="grid w-full grid-cols-[80px_70px_1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-app-elevated"
                      >
                        <span className="font-mono tabular-nums text-secondary">
                          {formatDateTime(r.created_at).slice(11)}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[r.status]
                          }`}
                        >
                          {r.status}
                        </span>
                        <span className="truncate text-secondary">
                          {r.model ?? "—"}
                          {r.channel ? (
                            <span className="ml-2 text-faint">
                              · {r.channel}
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono tabular-nums text-muted">
                          {fmtMs(r.duration_ms)}
                        </span>
                        <span className="font-mono tabular-nums text-muted">
                          {fmtTokens(r.tokens_in, r.tokens_out)}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 border-t border-app bg-app-elevated px-3 py-2 text-xs">
                          <Excerpt label="Input" text={r.input_excerpt} />
                          <Excerpt label="Output" text={r.output_excerpt} />
                          {r.error && (
                            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-rose-500">
                              <span className="text-[10px] uppercase tracking-wide">
                                Error
                              </span>
                              <div className="mt-1 whitespace-pre-wrap font-mono text-xs">
                                {r.error}
                              </div>
                            </div>
                          )}
                          <Meta r={r} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Excerpt({
  label,
  text,
}: {
  label: string;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-app p-2 font-mono text-[11px] text-app">
        {text}
      </pre>
    </div>
  );
}

function Meta({ r }: { r: AiAgentRunRow }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted">
      <dt>run id</dt>
      <dd className="truncate">{r.id}</dd>
      {r.workspace_id && (
        <>
          <dt>workspace</dt>
          <dd className="truncate">{r.workspace_id}</dd>
        </>
      )}
      {r.user_id && (
        <>
          <dt>user</dt>
          <dd className="truncate">{r.user_id}</dd>
        </>
      )}
    </dl>
  );
}
