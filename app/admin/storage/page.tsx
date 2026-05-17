import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatBytes,
  formatDateTime,
  inputClass,
} from "../_lib";
import { emptyTrashOlderThan } from "./_actions";

export const dynamic = "force-dynamic";

type WorkspaceFileRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
  deleted_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  user_id: string;
};

interface WorkspaceBreakdown {
  workspace_id: string;
  workspace_name: string;
  used_bytes: number;
  cap_bytes: number;
  file_count: number;
  pct: number;
}

const PER_WS_LIMIT = 50;
const TOP_FILE_LIMIT = 50;

export default async function AdminStoragePage({
  searchParams,
}: {
  searchParams: Promise<{ trash_days?: string }>;
}) {
  const sp = await searchParams;
  const defaultTrashDays = (() => {
    const n = Number(sp.trash_days);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 30;
  })();

  const admin = createAdminClient();

  // ─── Top-50 workspaces by used bytes ─────────────────────────────────
  // No off-the-shelf cross-workspace RPC exists; we sum in JS over the
  // metadata table. The bottleneck is the row count, capped at 100k by
  // the .limit() — well below memory limits. If platform storage grows
  // past that bound a follow-up RPC would be in order.
  const { data: filesRaw } = await admin
    .from("workspace_files")
    .select("id, workspace_id, user_id, name, size_bytes, content_type, created_at, deleted_at")
    .order("size_bytes", { ascending: false })
    .limit(100_000);

  const allFiles = (filesRaw ?? []) as WorkspaceFileRow[];

  const liveFiles = allFiles.filter((f) => !f.deleted_at);

  // Per-workspace aggregate over LIVE files (matches workspace_storage RPC).
  const wsAgg = new Map<
    string,
    { used_bytes: number; file_count: number }
  >();
  for (const f of liveFiles) {
    const e = wsAgg.get(f.workspace_id) ?? { used_bytes: 0, file_count: 0 };
    e.used_bytes += Number(f.size_bytes ?? 0);
    e.file_count += 1;
    wsAgg.set(f.workspace_id, e);
  }

  // Top 50 by usage
  const topUsage = Array.from(wsAgg.entries())
    .map(([id, agg]) => ({ id, ...agg }))
    .sort((a, b) => b.used_bytes - a.used_bytes)
    .slice(0, PER_WS_LIMIT);

  const topUsageIds = topUsage.map((t) => t.id);
  let workspaceMap = new Map<string, WorkspaceRow>();
  let storageStats = new Map<
    string,
    { workspace_id: string; cap_bytes: number; used_bytes: number }
  >();

  if (topUsageIds.length > 0) {
    // N+1 fix — was looping `rpc("workspace_storage")` per workspace
    // (~50 round-trips per render). Now four batch queries replicate
    // the RPC's join graph in JS: workspace → owner → subscription
    // tier → tier base cap → workspace storage add-on.
    const { data: wsRows } = await admin
      .from("workspaces")
      .select("id, name, user_id")
      .in("id", topUsageIds);
    for (const w of (wsRows ?? []) as WorkspaceRow[]) {
      workspaceMap.set(w.id, w);
    }

    const ownerIds = Array.from(
      new Set(
        ((wsRows ?? []) as WorkspaceRow[])
          .map((w) => w.user_id)
          .filter((v): v is string => Boolean(v))
      )
    );

    type SubRow = { user_id: string; tier_id: string | null };
    type TierRow = { tier_id: string; max_storage_per_workspace_mb: number };
    type AddonRow = { workspace_id: string; addon_gb: number };

    const [subsRes, addonsRes] = await Promise.all([
      ownerIds.length > 0
        ? admin
            .from("subscriptions")
            .select("user_id, tier_id")
            .in("user_id", ownerIds)
        : Promise.resolve({ data: [] as SubRow[] }),
      admin
        .from("workspace_storage_addons")
        .select("workspace_id, addon_gb")
        .in("workspace_id", topUsageIds),
    ]);

    const tierByUser = new Map<string, string>();
    for (const s of ((subsRes.data ?? []) as SubRow[])) {
      if (s.user_id && s.tier_id) tierByUser.set(s.user_id, s.tier_id);
    }
    const tierIds = Array.from(new Set([...tierByUser.values(), "free"]));
    const { data: tierRows } = await admin
      .from("subscription_tiers")
      .select("tier_id, max_storage_per_workspace_mb")
      .in("tier_id", tierIds);
    const tierBaseBytes = new Map<string, number>();
    for (const t of ((tierRows ?? []) as TierRow[])) {
      tierBaseBytes.set(
        t.tier_id,
        Number(t.max_storage_per_workspace_mb ?? 0) * 1024 * 1024
      );
    }
    const addonBytes = new Map<string, number>();
    for (const a of ((addonsRes.data ?? []) as AddonRow[])) {
      addonBytes.set(a.workspace_id, Number(a.addon_gb ?? 0) * 1024 * 1024 * 1024);
    }

    for (const t of topUsage) {
      const ws = workspaceMap.get(t.id);
      const ownerTier = ws ? tierByUser.get(ws.user_id) ?? "free" : "free";
      const baseBytes = tierBaseBytes.get(ownerTier) ?? 0;
      const addon = addonBytes.get(t.id) ?? 0;
      storageStats.set(t.id, {
        workspace_id: t.id,
        cap_bytes: baseBytes + addon,
        used_bytes: t.used_bytes,
      });
    }
  }

  const breakdown: WorkspaceBreakdown[] = topUsage.map((t) => {
    const ws = workspaceMap.get(t.id);
    const stat = storageStats.get(t.id);
    const cap = stat?.cap_bytes ?? 0;
    const pct = cap > 0 ? Math.round((100 * t.used_bytes) / cap) : 0;
    return {
      workspace_id: t.id,
      workspace_name: ws?.name ?? t.id.slice(0, 8),
      used_bytes: t.used_bytes,
      cap_bytes: cap,
      file_count: t.file_count,
      pct,
    };
  });

  // ─── Top-50 largest individual files (across platform, live only) ────
  const topFiles = liveFiles.slice(0, TOP_FILE_LIMIT);
  // Workspace name lookup for those files.
  const fileWsIds = Array.from(new Set(topFiles.map((f) => f.workspace_id)));
  const missingWsIds = fileWsIds.filter((id) => !workspaceMap.has(id));
  if (missingWsIds.length > 0) {
    const { data } = await admin
      .from("workspaces")
      .select("id, name, user_id")
      .in("id", missingWsIds);
    for (const w of (data ?? []) as WorkspaceRow[]) {
      workspaceMap.set(w.id, w);
    }
  }

  // ─── R2 / platform totals ────────────────────────────────────────────
  const totalBytes = allFiles.reduce(
    (acc, f) => acc + Number(f.size_bytes ?? 0),
    0
  );
  const totalFiles = allFiles.length;
  const trashedCount = allFiles.length - liveFiles.length;
  const trashedBytes = allFiles
    .filter((f) => f.deleted_at)
    .reduce((acc, f) => acc + Number(f.size_bytes ?? 0), 0);

  // Trash-by-age buckets (for the form hint).
  const now = Date.now();
  const trashBuckets = {
    "30+": 0,
    "60+": 0,
    "90+": 0,
  };
  for (const f of allFiles) {
    if (!f.deleted_at) continue;
    const ageDays = (now - new Date(f.deleted_at).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays >= 90) trashBuckets["90+"] += 1;
    if (ageDays >= 60) trashBuckets["60+"] += 1;
    if (ageDays >= 30) trashBuckets["30+"] += 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Storage admin</h1>
        <p className="mt-0.5 text-xs text-muted">
          Per-workspace usage, biggest files, trash management. Sums come
          from the <code className="font-mono">workspace_files</code>{" "}
          metadata table; bytes themselves live in R2.
        </p>
      </div>

      {/* Platform totals */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total bytes"
          value={formatBytes(totalBytes)}
          sub={`${totalFiles.toLocaleString()} rows`}
        />
        <StatCard
          label="Live files"
          value={liveFiles.length.toLocaleString()}
          sub={formatBytes(totalBytes - trashedBytes)}
          accent="emerald"
        />
        <StatCard
          label="Trashed"
          value={trashedCount.toLocaleString()}
          sub={formatBytes(trashedBytes)}
          accent="amber"
        />
        <StatCard
          label="Workspaces"
          value={wsAgg.size.toLocaleString()}
          sub="with files"
          accent="violet"
        />
      </section>

      {/* Per-workspace breakdown */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">
            Top {breakdown.length} workspaces by usage
          </h2>
          <span className="text-[11px] text-faint">
            Live files only. Cap = tier base + add-on (from{" "}
            <code className="font-mono">workspace_storage()</code>).
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">#</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-right font-normal">Files</th>
                <th className="px-3 py-2 text-right font-normal">Used</th>
                <th className="px-3 py-2 text-right font-normal">Cap</th>
                <th className="px-3 py-2 text-left font-normal">% of cap</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-faint">
                    No files yet.
                  </td>
                </tr>
              ) : (
                breakdown.map((b, i) => (
                  <tr
                    key={b.workspace_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 text-right font-mono text-[10px] tabular-nums text-faint">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workspaces/${b.workspace_id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        {b.workspace_name}
                      </Link>
                      <div className="font-mono text-[10px] text-faint">
                        {b.workspace_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {b.file_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-app">
                      {formatBytes(b.used_bytes)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {b.cap_bytes > 0 ? formatBytes(b.cap_bytes) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <UsageBar pct={b.pct} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top files */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">
            Top {topFiles.length} largest files
          </h2>
          <span className="text-[11px] text-faint">
            Excludes soft-deleted. Click a row to jump to the workspace.
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">#</th>
                <th className="px-3 py-2 text-left font-normal">Name</th>
                <th className="px-3 py-2 text-right font-normal">Size</th>
                <th className="px-3 py-2 text-left font-normal">Type</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-left font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {topFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-faint">
                    No files yet.
                  </td>
                </tr>
              ) : (
                topFiles.map((f, i) => {
                  const ws = workspaceMap.get(f.workspace_id);
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-app last:border-b-0 hover:bg-app/40"
                    >
                      <td className="px-3 py-2 text-right font-mono text-[10px] tabular-nums text-faint">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 max-w-[26rem] truncate text-app">
                        {f.name}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-app">
                        {formatBytes(f.size_bytes)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-secondary">
                        {f.content_type ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/workspaces/${f.workspace_id}`}
                          className="text-secondary hover:text-tool-accent"
                        >
                          {ws?.name ?? f.workspace_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {formatDateTime(f.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Empty trash */}
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Empty trash
        </h2>
        <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
          Permanently delete <code className="font-mono">workspace_files</code>{" "}
          rows whose <code className="font-mono">deleted_at</code> is older
          than the threshold. R2 objects are reaped by a follow-up job; this
          frees the metadata + storage quota immediately.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">
            30d+ in trash:{" "}
            <span className="font-mono tabular-nums">{trashBuckets["30+"]}</span>
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">
            60d+:{" "}
            <span className="font-mono tabular-nums">{trashBuckets["60+"]}</span>
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">
            90d+:{" "}
            <span className="font-mono tabular-nums">{trashBuckets["90+"]}</span>
          </span>
        </div>

        <form
          action={emptyTrashOlderThan}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Older than (days)
            </div>
            <input
              type="number"
              name="days"
              min={0}
              max={3650}
              step={1}
              defaultValue={defaultTrashDays}
              className={`${inputClass} mt-1 w-32`}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
          >
            Empty trash
          </button>
          <Link
            href="/admin/audit?action=storage.empty_trash"
            className={buttonGhostClass}
          >
            View past empties
          </Link>
        </form>
        <p className="mt-2 text-[11px] text-faint">
          0 = nukes everything currently trashed. Action is audited as{" "}
          <code className="font-mono">storage.empty_trash</code>.
        </p>
      </section>

      {/* R2 health stub */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">R2 bucket health</h2>
        <p className="mt-1 text-xs text-muted">
          Numbers below reflect the metadata table. A full bucket scan is
          out of scope for v2 — this stub gives a rough match against R2
          billing.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm md:grid-cols-4">
          <dt className="text-muted">Total bytes</dt>
          <dd className="font-mono tabular-nums text-app">
            {formatBytes(totalBytes)}
          </dd>
          <dt className="text-muted">Total rows</dt>
          <dd className="font-mono tabular-nums text-app">
            {totalFiles.toLocaleString()}
          </dd>
          <dt className="text-muted">Live</dt>
          <dd className="font-mono tabular-nums text-emerald-500">
            {liveFiles.length.toLocaleString()}
          </dd>
          <dt className="text-muted">Soft-deleted</dt>
          <dd className="font-mono tabular-nums text-amber-500">
            {trashedCount.toLocaleString()}
          </dd>
        </dl>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "amber" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "violet"
          ? "text-tool-accent"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
          {sub}
        </div>
      )}
    </div>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    clamped >= 90
      ? "bg-rose-500"
      : clamped >= 70
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-secondary">
        {clamped}%
      </span>
    </div>
  );
}

// `buttonClass` is imported for use in nested CTA contexts (kept exported
// to avoid re-import churn if the page grows).
void buttonClass;
