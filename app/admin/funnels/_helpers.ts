/**
 * UI helpers + types for `/admin/funnels`. Synchronous module — safe to
 * import into RSC pages.
 */

export interface FunnelStep {
  name: string;
  event_kind: string;
  match: Record<string, unknown>;
}

/** Coerce funnel.steps (jsonb) into a typed array — drops malformed entries. */
export function asFunnelSteps(raw: unknown): FunnelStep[] {
  if (!Array.isArray(raw)) return [];
  const out: FunnelStep[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const x = r as Record<string, unknown>;
    const name = typeof x.name === "string" ? x.name : "";
    const event_kind = typeof x.event_kind === "string" ? x.event_kind : "";
    const match =
      typeof x.match === "object" && x.match !== null && !Array.isArray(x.match)
        ? (x.match as Record<string, unknown>)
        : {};
    if (!name || !event_kind) continue;
    out.push({ name, event_kind, match });
  }
  return out;
}

export const DEFAULT_FUNNEL_STEPS: FunnelStep[] = [
  { name: "Sign up", event_kind: "user.sign_up", match: {} },
  { name: "Create workspace", event_kind: "workspace.created", match: {} },
  { name: "First tool open", event_kind: "tool.opened", match: {} },
  { name: "Activate Pro", event_kind: "subscription.upgraded", match: { tier: "pro" } },
];

/** Date-range presets for the conversion chart. */
export const RANGE_OPTIONS: Array<{ value: string; label: string; days: number }> = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
];

export function pickRangeDays(value: string | null | undefined): number {
  const s = String(value ?? "30");
  const found = RANGE_OPTIONS.find((r) => r.value === s);
  return found ? found.days : 30;
}
