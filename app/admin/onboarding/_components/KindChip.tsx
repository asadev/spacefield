import type { OnboardingStepKind } from "../../_types";

const STYLES: Record<OnboardingStepKind, string> = {
  welcome: "bg-tool-accent-soft text-tool-accent",
  tour: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  form: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  video: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  checklist: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "call-to-action": "bg-rose-500/15 text-rose-500",
};

export default function KindChip({ kind }: { kind: OnboardingStepKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[kind]}`}
    >
      {kind}
    </span>
  );
}
