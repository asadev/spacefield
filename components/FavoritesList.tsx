import { listForUser } from "@/lib/favorites";

/**
 * FavoritesList — server component rendering the current user's
 * favorites as a vertical list. Designed to drop into a sidebar or
 * widget shelf without any client-side wiring; the per-row star UI
 * lives on the entity detail pages where it has full context.
 */

const ENTITY_LABEL: Record<string, string> = {
  crm_contact: "Contact",
  crm_company: "Company",
  crm_deal: "Deal",
  crm_lead: "Lead",
  workspace_file: "File",
  task: "Task",
  project: "Project",
  employee: "Employee",
  comment: "Comment",
  onboarding_template: "Onboarding",
};

const ENTITY_HREF: Record<string, (id: string) => string> = {
  crm_contact: (id) => `/solutions/tools/crm-suite?contact=${id}`,
  crm_company: (id) => `/solutions/tools/crm-suite?company=${id}`,
  crm_deal: (id) => `/solutions/tools/crm-suite?deal=${id}`,
  crm_lead: (id) => `/solutions/tools/crm-suite?lead=${id}`,
  workspace_file: (id) => `/files?id=${id}`,
};

function EntityIcon({ type }: { type: string }) {
  // A small set of stroke-only glyphs covers the common entity types
  // without a dependency on lucide / heroicons.
  const path =
    type === "workspace_file"
      ? "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6"
      : type === "crm_company"
        ? "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"
        : type === "crm_deal"
          ? "M12 2v20M5 9l7-7 7 7M5 15l7 7 7-7"
          : type === "crm_lead"
            ? "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3"
            : type === "task" || type === "project"
              ? "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
              : type === "employee"
                ? "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                : "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="flex-shrink-0 text-muted"
    >
      <path d={path} />
    </svg>
  );
}

export default async function FavoritesList({
  limit = 25,
}: {
  limit?: number;
}) {
  const favorites = await listForUser();

  if (favorites.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-3 text-center text-[11px] text-muted">
        <div className="mb-1 text-app">No favorites yet</div>
        <div>Star records to pin them here for quick access.</div>
      </div>
    );
  }

  const list = favorites.slice(0, limit);

  return (
    <ul className="space-y-0.5">
      {list.map((f) => {
        const href = ENTITY_HREF[f.entity_type]?.(f.entity_id) ?? null;
        const label =
          f.label ||
          `${ENTITY_LABEL[f.entity_type] ?? f.entity_type} · ${f.entity_id.slice(0, 8)}`;
        const inner = (
          <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface">
            <EntityIcon type={f.entity_type} />
            <span className="flex-1 truncate text-app">{label}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-faint">
              {ENTITY_LABEL[f.entity_type] ?? f.entity_type}
            </span>
          </div>
        );
        return (
          <li key={f.id}>
            {href ? <a href={href}>{inner}</a> : inner}
          </li>
        );
      })}
    </ul>
  );
}
