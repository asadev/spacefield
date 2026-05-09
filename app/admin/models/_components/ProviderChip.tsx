import type { ModelProvider } from "../../_types";

const LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  meta: "Meta",
  mistral: "Mistral",
  custom: "Custom",
};

/**
 * Provider chip. We avoid arbitrary brand colours per the contract; all
 * providers render with the muted/secondary admin tokens. The label
 * itself is enough to disambiguate.
 */
export default function ProviderChip({ provider }: { provider: ModelProvider }) {
  return (
    <span className="inline-flex items-center rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
      {LABELS[provider] ?? provider}
    </span>
  );
}
