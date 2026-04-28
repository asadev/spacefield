/* ─────────────────────────────────────────────────────────────────────────
 * Tiny presentational primitives shared across the records surfaces.
 * Avatar / TagChip / StatusPill — colocated to avoid file-explosion.
 * ───────────────────────────────────────────────────────────────────── */

import type { CrmInventoryStatus, CrmTag } from "../../types";
import { initialsFor } from "./helpers";

const AVATAR_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ["#0ea5e9", "#0c4a6e"],
  ["#22c55e", "#14532d"],
  ["#f97316", "#7c2d12"],
  ["#a855f7", "#581c87"],
  ["#ec4899", "#831843"],
  ["#14b8a6", "#134e4a"],
  ["#f59e0b", "#78350f"],
  ["#6366f1", "#312e81"],
];

function colorIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_PALETTE.length;
}

export function Avatar({
  name,
  email,
  size = 24,
  src,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? email ?? ""}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const seed = (name ?? email ?? "??").trim() || "??";
  const [, fg] = AVATAR_PALETTE[colorIndex(seed)];
  const initials = initialsFor([name, email]);
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full font-mono font-semibold uppercase"
      style={{
        width: size,
        height: size,
        background: "var(--surface)",
        color: fg,
        border: "1px solid var(--border)",
        fontSize: Math.max(9, Math.floor(size * 0.4)),
        letterSpacing: "0.03em",
      }}
    >
      {initials}
    </span>
  );
}

export function TagChip({ tag, size = "sm" }: { tag: CrmTag; size?: "sm" | "xs" }) {
  const padding = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";
  const text = size === "xs" ? "text-[0.55rem]" : "text-[0.6rem]";
  return (
    <span
      className={`inline-flex items-center rounded-full border ${padding} ${text} font-mono uppercase tracking-[0.12em]`}
      style={{
        borderColor: tag.color,
        color: tag.color,
        background: `${tag.color}1a`,
      }}
      title={tag.name}
    >
      {tag.name}
    </span>
  );
}

const STATUS_STYLES: Record<
  CrmInventoryStatus,
  { bg: string; fg: string; label: string }
> = {
  active: { bg: "rgba(34,197,94,0.15)", fg: "#16a34a", label: "Active" },
  inactive: { bg: "rgba(148,163,184,0.18)", fg: "#475569", label: "Inactive" },
  archived: { bg: "rgba(248,113,113,0.18)", fg: "#b91c1c", label: "Archived" },
};

export function InventoryStatusPill({ status }: { status: CrmInventoryStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em]"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export function CountPill({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-secondary ${
        onClick ? "cursor-pointer hover:text-app hover:border-tool-accent" : ""
      }`}
    >
      <span className="text-app">{count}</span>
      <span>{label}</span>
    </Tag>
  );
}
