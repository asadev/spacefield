import {
  EFFORT_LABEL,
  PHASE_CLASSES,
  PHASE_LABEL,
  PRIORITY_CLASSES,
  STATUS_CLASSES,
  STATUS_LABEL,
  type Item,
} from "../_checklist";

/**
 * Compact, scannable row for one checklist item. Used by the list view
 * and the kanban columns.
 */
export default function ItemRow({ item, showPhase = false }: { item: Item; showPhase?: boolean }) {
  return (
    <li id={item.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-app">{item.title}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide ${PRIORITY_CLASSES[item.priority]}`}>
            {item.priority}
          </span>
          {item.effort ? (
            <span className="rounded bg-app-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-faint">
              {EFFORT_LABEL[item.effort]}
            </span>
          ) : null}
          {showPhase ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${PHASE_CLASSES[item.phase]}`}>
              {PHASE_LABEL[item.phase]}
            </span>
          ) : null}
        </div>
        {item.notes ? (
          <p className="mt-1 text-xs leading-relaxed text-secondary">{item.notes}</p>
        ) : null}
        {item.ref ? (
          <p className="mt-1 font-mono text-[11px] text-faint">{item.ref}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_CLASSES[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>
    </li>
  );
}
