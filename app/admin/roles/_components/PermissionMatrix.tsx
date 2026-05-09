import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "../../_types";
import { togglePermission } from "../_actions";

/**
 * Permission matrix grid. Rows = resources, columns = actions. Each
 * cell is its own native form: clicking the checkbox submits the form
 * and posts the desired state to `togglePermission`. No client-side
 * state — Next revalidates the route after the action and re-renders
 * with the new grid.
 *
 * Special cases:
 *   - readOnly=true: render a banner instead of the grid (used for
 *     the wildcard `super-admin` role).
 *   - resource `*` / action `*` rows are not editable here. Wildcard
 *     bookkeeping is admin-driven through migrations.
 */

export interface PermissionMatrixProps {
  roleId: string;
  granted: Set<string>; // keys: `${resource}:${action}`
  readOnly?: boolean;
  isWildcard?: boolean;
}

function permKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

export default function PermissionMatrix({
  roleId,
  granted,
  readOnly,
  isWildcard,
}: PermissionMatrixProps) {
  if (readOnly || isWildcard) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-amber-500">
          Wildcard role
        </div>
        <div className="mt-1 text-sm text-app">
          Full access — wildcard{" "}
          <code className="rounded bg-app px-1 font-mono text-xs text-app">
            * / *
          </code>
        </div>
        <p className="mt-2 max-w-2xl text-xs text-secondary">
          The <code className="font-mono">super-admin</code> role is
          treated as full access by{" "}
          <code className="font-mono">has_permission()</code> and the
          legacy <code className="font-mono">profiles.is_admin</code>{" "}
          flag. The matrix is intentionally read-only so a misclick
          can&apos;t lock everyone out.
        </p>
      </div>
    );
  }

  // Resources are sorted by group for readability.
  const resources = [...PERMISSION_RESOURCES];

  return (
    <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            <th className="sticky left-0 z-10 bg-app-elevated px-3 py-2 text-left font-normal">
              Resource
            </th>
            {PERMISSION_ACTIONS.map((act) => (
              <th
                key={act}
                className="px-3 py-2 text-center font-normal"
                title={`${act} permission`}
              >
                {act}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((res) => {
            const grantedActions = PERMISSION_ACTIONS.filter((a) =>
              granted.has(permKey(res, a))
            );
            return (
              <tr
                key={res}
                className="border-b border-app last:border-b-0 hover:bg-app/40"
              >
                <td className="sticky left-0 z-10 bg-app-elevated px-3 py-2 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-app">{res}</span>
                    {grantedActions.length > 0 && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-500">
                        {grantedActions.length}
                      </span>
                    )}
                  </div>
                </td>
                {PERMISSION_ACTIONS.map((act) => {
                  const k = permKey(res, act);
                  const isGranted = granted.has(k);
                  return (
                    <td
                      key={act}
                      className={
                        "px-3 py-2 text-center align-middle " +
                        (isGranted ? "bg-emerald-500/5" : "")
                      }
                    >
                      <form action={togglePermission} className="inline-flex">
                        <input type="hidden" name="role_id" value={roleId} />
                        <input type="hidden" name="resource" value={res} />
                        <input type="hidden" name="action" value={act} />
                        <input
                          type="hidden"
                          name="desired"
                          value={isGranted ? "off" : "on"}
                        />
                        <button
                          type="submit"
                          aria-label={`${isGranted ? "Revoke" : "Grant"} ${res}:${act} for ${roleId}`}
                          aria-pressed={isGranted}
                          title={`${isGranted ? "Click to revoke" : "Click to grant"} ${res}:${act}`}
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded border transition-colors " +
                            (isGranted
                              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"
                              : "border-app bg-app-elevated text-faint hover:border-tool-accent")
                          }
                        >
                          {isGranted ? "✓" : ""}
                        </button>
                      </form>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
