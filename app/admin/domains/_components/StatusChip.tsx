import type { CustomDomainScope, CustomDomainStatus } from "../../_types";

const STATUS_LABEL: Record<CustomDomainStatus, string> = {
  pending: "Pending",
  txt_verified: "TXT verified",
  cname_verified: "CNAME verified",
  active: "Active",
  failed: "Failed",
  disabled: "Disabled",
};

const STATUS_CLASS: Record<CustomDomainStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  txt_verified: "bg-tool-accent-soft text-tool-accent",
  cname_verified: "bg-tool-accent-soft text-tool-accent",
  active: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-500",
  disabled: "bg-app-elevated text-secondary border border-app",
};

export function StatusChip({ status }: { status: CustomDomainStatus }) {
  const cls = STATUS_CLASS[status] ?? STATUS_CLASS.pending;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

export function ScopeChip({ scope }: { scope: CustomDomainScope }) {
  const cls =
    scope === "toshare"
      ? "bg-tool-accent-soft text-tool-accent"
      : "bg-app-elevated text-secondary border border-app";
  const label = scope === "toshare" ? "toShare" : "workspace";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function CheckMark({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
        ok
          ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
          : "bg-app-elevated text-faint"
      }`}
      aria-label={ok ? "verified" : "not verified"}
      title={ok ? "verified" : "not verified"}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}
