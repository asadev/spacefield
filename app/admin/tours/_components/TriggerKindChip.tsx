import type { ProductTourRow } from "../../_types";

type Kind = ProductTourRow["trigger_kind"];

const STYLES: Record<Kind, string> = {
  manual: "bg-app-elevated text-secondary border border-app",
  first_visit: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  feature_flag: "bg-tool-accent-soft text-tool-accent",
  dom_query: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
};

export default function TriggerKindChip({ kind }: { kind: Kind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[kind]}`}
    >
      {kind.replace("_", " ")}
    </span>
  );
}
