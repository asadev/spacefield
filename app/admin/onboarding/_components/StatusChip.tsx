type FlowStatus = "live" | "draft" | "archived";

const STYLES: Record<FlowStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  archived: "bg-app-elevated text-secondary border border-app",
};

export default function StatusChip({ status }: { status: FlowStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
