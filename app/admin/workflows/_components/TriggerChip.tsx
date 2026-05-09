type TriggerKind = "manual" | "event" | "cron";

const STYLES: Record<TriggerKind, string> = {
  manual: "bg-app-elevated text-secondary border border-app",
  event: "bg-tool-accent-soft text-tool-accent",
  cron: "bg-emerald-500/15 text-emerald-500",
};

export default function TriggerChip({ kind }: { kind: TriggerKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[kind]}`}
    >
      {kind}
    </span>
  );
}
