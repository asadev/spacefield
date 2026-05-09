import type { AgentKind } from "../../_types";

const STYLES: Record<AgentKind, string> = {
  chat: "bg-tool-accent-soft text-tool-accent",
  "tool-sidekick": "bg-app-elevated text-secondary border border-app",
  system: "bg-app-elevated text-faint border border-app",
};

const LABELS: Record<AgentKind, string> = {
  chat: "chat",
  "tool-sidekick": "sidekick",
  system: "system",
};

export default function KindChip({ kind }: { kind: AgentKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[kind]}`}
    >
      {LABELS[kind]}
    </span>
  );
}
