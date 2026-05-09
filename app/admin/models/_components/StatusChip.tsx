import type { ModelStatus } from "../../_types";

const STYLES: Record<ModelStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  beta: "bg-tool-accent-soft text-tool-accent",
  deprecated: "bg-app-elevated text-secondary border border-app",
};

const LABELS: Record<ModelStatus, string> = {
  live: "Live",
  beta: "Beta",
  deprecated: "Deprecated",
};

export default function StatusChip({ status }: { status: ModelStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
