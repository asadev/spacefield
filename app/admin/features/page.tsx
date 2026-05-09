import Link from "next/link";

import { getAllFlags } from "@/lib/features";

import { buttonClass, formatDateTime, inputClass } from "../_lib";

import { createFlag, toggleFlag } from "./_actions";

import type { FeatureFlagRow, FeatureRollout } from "../_types";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  const flags = await getAllFlags();

  const stats = computeStats(flags);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Features
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Feature flags</h1>
        <p className="mt-0.5 text-xs text-muted">
          Named on/off switches with rollout strategies. Code calls{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            featureEnabled(&quot;key&quot;)
          </code>{" "}
          to gate behavior.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total flags" value={stats.total} />
        <StatCard label="On" value={stats.on} accent="emerald" />
        <StatCard label="Allowlist" value={stats.allowlist} accent="amber" />
        <StatCard label="Percent" value={stats.percent} accent="violet" />
      </div>

      {/* Create form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Add a flag</h2>
        <p className="mt-0.5 text-xs text-muted">
          Keys: lowercase letters, digits, dots, underscores. Defaults
          to off + rollout=off.
        </p>
        <form action={createFlag} className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_1fr_auto]">
          <input
            type="text"
            name="key"
            required
            placeholder="domain.feature_name"
            pattern="^[a-z][a-z0-9_.]*$"
            className={`${inputClass} font-mono`}
          />
          <input
            type="text"
            name="title"
            placeholder="Human title (optional)"
            className={inputClass}
          />
          <input
            type="text"
            name="description"
            placeholder="Short description (optional)"
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            + New flag
          </button>
        </form>
      </section>

      {/* Index table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Key</th>
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Rollout</th>
              <th className="px-3 py-2 text-left font-normal">Allowlist</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-faint"
                >
                  No feature flags yet. Add one above.
                </td>
              </tr>
            ) : (
              flags.map((flag) => (
                <FlagRow key={flag.key} flag={flag} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────── components ───────────────────── */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
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
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function FlagRow({ flag }: { flag: FeatureFlagRow }) {
  const allowUsers = flag.allowlist_user_ids.length;
  const allowWs = flag.allowlist_workspace_ids.length;
  const encodedKey = encodeURIComponent(flag.key);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2 font-mono text-xs text-app">{flag.key}</td>
      <td className="px-3 py-2 text-secondary">
        <div className="truncate text-sm text-app">{flag.title || "—"}</div>
        {flag.description && (
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {flag.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <form action={toggleFlag} className="inline-flex">
          <input type="hidden" name="key" value={flag.key} />
          <input
            type="hidden"
            name="enabled"
            value={flag.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            title={flag.enabled ? "Click to disable" : "Click to enable"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
              flag.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {flag.enabled ? "On" : "Off"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2">
        <RolloutChip rollout={flag.rollout} percent={flag.rollout_percent} />
      </td>
      <td className="px-3 py-2 text-xs text-muted">
        {allowUsers === 0 && allowWs === 0 ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="font-mono tabular-nums">
            {allowUsers}u · {allowWs}w
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(flag.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/features/${encodedKey}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

export function RolloutChip({
  rollout,
  percent,
}: {
  rollout: FeatureRollout;
  percent: number;
}) {
  switch (rollout) {
    case "off":
      return (
        <span className="rounded-full bg-app px-2 py-0.5 text-[10px] font-medium text-faint border border-app">
          off
        </span>
      );
    case "on":
      return (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
          on
        </span>
      );
    case "allowlist":
      return (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
          allowlist
        </span>
      );
    case "percent":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium text-tool-accent">
          <span>percent</span>
          <span className="font-mono tabular-nums">{percent}%</span>
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-app px-2 py-0.5 text-[10px] font-medium text-faint border border-app">
          ?
        </span>
      );
  }
}

function computeStats(flags: FeatureFlagRow[]) {
  let on = 0;
  let allowlist = 0;
  let percent = 0;
  for (const f of flags) {
    if (f.enabled && f.rollout !== "off") on += 1;
    if (f.rollout === "allowlist") allowlist += 1;
    if (f.rollout === "percent") percent += 1;
  }
  return { total: flags.length, on, allowlist, percent };
}
