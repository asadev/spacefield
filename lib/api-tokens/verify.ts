import "server-only";

/**
 * Scope-checking helpers for public API bearer tokens.
 *
 * The /api/v1/* namespace ships with a small, resource-oriented scope
 * catalogue distinct from the management-surface scopes that already
 * exist in app/admin/_types.ts. Two wildcards bypass the per-resource
 * check:
 *
 *   - `read:all`     → satisfies any `read:*` scope.
 *   - `admin:write`  → satisfies anything (legacy power-user grant).
 *
 * Tokens minted from /admin/api-tokens may carry either or both
 * catalogues. The helpers below accept the union list as it appears on
 * the row.
 */

export const V1_SCOPES = [
  "read:tasks",
  "read:projects",
  "read:contacts",
  "read:deals",
  "read:employees",
  "read:all",
] as const;

export type V1Scope = (typeof V1_SCOPES)[number];

/**
 * Returns true when the granted scope list satisfies `required`.
 * Wildcards (`read:all`, `admin:write`) are honoured.
 *
 * The function accepts a generic `string[]` because tokens may carry
 * legacy scopes from `app/admin/_types.ts::API_SCOPES` alongside the
 * v1 catalogue — we don't want to throw on values we don't recognise.
 */
export function tokenHasScope(
  granted: readonly string[] | null | undefined,
  required: V1Scope | string
): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes(required)) return true;

  // `read:all` satisfies any `read:*` request.
  if (required.startsWith("read:") && granted.includes("read:all")) {
    return true;
  }
  // `admin:write` is the historical super-grant.
  if (granted.includes("admin:write")) return true;

  return false;
}

/**
 * Convenience: check multiple scopes at once. The token must satisfy
 * EVERY required scope (AND semantics) — this isn't used today by the
 * v1 endpoints but is here so callers don't reinvent it.
 */
export function tokenHasAllScopes(
  granted: readonly string[] | null | undefined,
  required: readonly (V1Scope | string)[]
): boolean {
  return required.every((s) => tokenHasScope(granted, s));
}
