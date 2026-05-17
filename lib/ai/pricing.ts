/**
 * Model pricing in USD per 1K tokens.
 *
 * Public list-price as of 2026-05; refresh occasionally. Keys are
 * canonical short ids — match whatever the runtime is passing to
 * `recordAiCall`. Aliases (e.g. dated model snapshots) fall through to
 * the family default in `resolveModelPricing()`.
 *
 * Source of truth:
 *   - Anthropic:  https://www.anthropic.com/pricing
 *   - OpenAI:     https://openai.com/api/pricing
 *
 * The Postgres column is numeric(12,6) so we have 6 decimals to play
 * with — perfectly fine for these tenths-of-a-cent figures.
 */
export interface ModelPrice {
  input: number;   // $ per 1K input tokens
  output: number;  // $ per 1K output tokens
}

export const MODEL_PRICING_USD_PER_1K: Record<string, ModelPrice> = {
  // ── Anthropic Claude family ──
  "claude-opus-4-5":            { input: 0.015,  output: 0.075 },
  "claude-opus-4":              { input: 0.015,  output: 0.075 },
  "claude-sonnet-4-5":          { input: 0.003,  output: 0.015 },
  "claude-sonnet-4":            { input: 0.003,  output: 0.015 },
  "claude-3-7-sonnet":          { input: 0.003,  output: 0.015 },
  "claude-3-5-sonnet":          { input: 0.003,  output: 0.015 },
  "claude-3-5-haiku":           { input: 0.0008, output: 0.004 },
  "claude-haiku-4-5":           { input: 0.001,  output: 0.005 },
  "claude-3-opus":              { input: 0.015,  output: 0.075 },
  "claude-3-sonnet":            { input: 0.003,  output: 0.015 },
  "claude-3-haiku":             { input: 0.00025, output: 0.00125 },

  // ── OpenAI GPT family (chat) ──
  "gpt-4o":                     { input: 0.0025, output: 0.01 },
  "gpt-4o-mini":                { input: 0.00015, output: 0.0006 },
  "gpt-4.1":                    { input: 0.002,  output: 0.008 },
  "gpt-4.1-mini":               { input: 0.0004, output: 0.0016 },
  "gpt-4.1-nano":               { input: 0.0001, output: 0.0004 },
  "gpt-4-turbo":                { input: 0.01,   output: 0.03 },
  "o1":                         { input: 0.015,  output: 0.06 },
  "o1-mini":                    { input: 0.003,  output: 0.012 },
  "o3-mini":                    { input: 0.0011, output: 0.0044 },

  // ── OpenAI embeddings ──
  "text-embedding-3-small":     { input: 0.00002, output: 0 },
  "text-embedding-3-large":     { input: 0.00013, output: 0 },
  "text-embedding-ada-002":     { input: 0.0001,  output: 0 },
};

/**
 * Look up pricing for a model id. Tolerates dated snapshots
 * ("claude-3-5-sonnet-20241022" → "claude-3-5-sonnet") by walking
 * back through hyphen-separated suffixes until we find a hit.
 *
 * Returns `null` if nothing matches — caller should treat as 0$ cost
 * (and ideally log so we notice the gap).
 */
export function resolveModelPricing(model: string): ModelPrice | null {
  if (!model) return null;
  if (MODEL_PRICING_USD_PER_1K[model]) return MODEL_PRICING_USD_PER_1K[model];
  const parts = model.split("-");
  for (let i = parts.length - 1; i > 1; i -= 1) {
    const candidate = parts.slice(0, i).join("-");
    if (MODEL_PRICING_USD_PER_1K[candidate]) {
      return MODEL_PRICING_USD_PER_1K[candidate];
    }
  }
  return null;
}

/**
 * Compute total USD cost for a call. Returns 0 if the model is
 * unknown — caller decides whether to log.
 */
export function priceCall(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = resolveModelPricing(model);
  if (!price) return 0;
  const inUsd = (inputTokens / 1000) * price.input;
  const outUsd = (outputTokens / 1000) * price.output;
  return Number((inUsd + outUsd).toFixed(6));
}
