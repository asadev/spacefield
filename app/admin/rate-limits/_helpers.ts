import type { RateLimitRuleRow, RateLimitScope } from "../_types";

export const RATE_LIMIT_SCOPES: RateLimitScope[] = [
  "global",
  "tier",
  "user",
  "workspace",
  "route",
];

export const SCOPE_LABEL: Record<RateLimitScope, string> = {
  global: "Global",
  tier: "Tier",
  user: "User",
  workspace: "Workspace",
  route: "Route",
};

/**
 * Specificity ranking: more-specific scopes win when multiple rules
 * match. Used by the tester. Higher = more specific.
 */
export const SCOPE_SPECIFICITY: Record<RateLimitScope, number> = {
  global: 0,
  tier: 1,
  workspace: 2,
  user: 3,
  route: 4,
};

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scopeChipClass(scope: RateLimitScope): string {
  switch (scope) {
    case "global":
      return "bg-app text-faint border border-app";
    case "tier":
      return "bg-tool-accent-soft text-tool-accent";
    case "workspace":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    case "user":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "route":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-app text-faint border border-app";
  }
}

/* ─────────────────────── tester ─────────────────────── */

export type RateLimitTestInput = {
  userId?: string | null;
  tierId?: string | null;
  workspaceId?: string | null;
  route?: string | null;
};

export type RateLimitMatchRow = {
  rule: RateLimitRuleRow;
  reason: string;
  specificity: number;
};

/**
 * Match a mock identity against an array of rules.
 * Route patterns: "*" matches everything; otherwise exact-match OR
 * substring-with-asterisks (simple `*` => `.*` regex).
 */
export function matchRules(
  rules: RateLimitRuleRow[],
  input: RateLimitTestInput
): RateLimitMatchRow[] {
  const matches: RateLimitMatchRow[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    let matched = false;
    let reason = "";

    switch (rule.scope) {
      case "global":
        matched = true;
        reason = "Applies globally";
        break;
      case "tier":
        if (input.tierId && rule.scope_value === input.tierId) {
          matched = true;
          reason = `Tier matches "${input.tierId}"`;
        }
        break;
      case "user":
        if (input.userId && rule.scope_value === input.userId) {
          matched = true;
          reason = "User id matches";
        }
        break;
      case "workspace":
        if (input.workspaceId && rule.scope_value === input.workspaceId) {
          matched = true;
          reason = "Workspace id matches";
        }
        break;
      case "route":
        if (input.route && rule.route_pattern) {
          if (matchesRoute(input.route, rule.route_pattern)) {
            matched = true;
            reason = `Route "${input.route}" matches pattern "${rule.route_pattern}"`;
          }
        }
        break;
    }

    if (matched) {
      matches.push({
        rule,
        reason,
        specificity: SCOPE_SPECIFICITY[rule.scope] ?? 0,
      });
    }
  }

  matches.sort((a, b) => b.specificity - a.specificity);
  return matches;
}

function matchesRoute(input: string, pattern: string): boolean {
  if (pattern === "*" || pattern === "/*") return true;
  if (pattern === input) return true;
  // Convert `*` glob to a simple regex.
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(input);
}

/* ─────────────────────── label helpers ─────────────────────── */

export function describeScopeValue(rule: RateLimitRuleRow): string {
  if (rule.scope === "global") return "—";
  if (rule.scope === "route") return rule.route_pattern ?? "—";
  return rule.scope_value ?? "—";
}
