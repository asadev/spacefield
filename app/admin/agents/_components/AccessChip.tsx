import type { AgentAccessMode } from "../../_types";

const STYLES: Record<AgentAccessMode, string> = {
  all: "bg-emerald-500/15 text-emerald-500",
  tier: "bg-tool-accent-soft text-tool-accent",
  workspace_role: "bg-sky-500/15 text-sky-500 dark:text-sky-400",
  allowlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  admin_only: "bg-rose-500/15 text-rose-500",
};

const LABELS: Record<AgentAccessMode, string> = {
  all: "all",
  tier: "tier",
  workspace_role: "role",
  allowlist: "allowlist",
  admin_only: "admin",
};

export default function AccessChip({ mode }: { mode: AgentAccessMode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[mode]}`}
    >
      {LABELS[mode]}
    </span>
  );
}
