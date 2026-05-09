type ProviderStatus = "live" | "paused" | "disabled";

const STYLES: Record<ProviderStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disabled: "bg-app-elevated text-secondary border border-app",
};

const LABELS: Record<ProviderStatus, string> = {
  live: "Live",
  paused: "Paused",
  disabled: "Disabled",
};

export default function StatusChip({ status }: { status: ProviderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
