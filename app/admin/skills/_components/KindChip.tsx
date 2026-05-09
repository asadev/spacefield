import type { SkillKind } from "../../_types";

const STYLES: Record<SkillKind, string> = {
  code: "bg-tool-accent-soft text-tool-accent",
  custom: "bg-emerald-500/15 text-emerald-500",
};

const LABELS: Record<SkillKind, string> = {
  code: "code",
  custom: "custom",
};

export default function KindChip({ kind }: { kind: SkillKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[kind]}`}
    >
      {LABELS[kind]}
    </span>
  );
}
