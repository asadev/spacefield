import type { CapabilityTier } from "../../_types";

const LABELS: Record<CapabilityTier, string> = {
  flagship: "Flagship",
  balanced: "Balanced",
  fast: "Fast",
  reasoning: "Reasoning",
};

export default function TierChip({ tier }: { tier: CapabilityTier }) {
  return (
    <span className="inline-flex items-center rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] font-medium text-secondary">
      {LABELS[tier]}
    </span>
  );
}
