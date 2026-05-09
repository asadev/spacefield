import { WEBHOOK_EVENTS } from "../_constants";

/* Server-rendered events checkbox list. Submits as multiple `events`
 * fields in the form data; `_actions.ts` re-validates against the
 * inline catalogue and dedupes. No client interactivity needed — the
 * checkboxes are native form controls. */

export function EventsPicker({ selected }: { selected: string[] }) {
  const set = new Set(selected);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {WEBHOOK_EVENTS.map((ev) => (
        <label
          key={ev}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-app bg-app px-2 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
        >
          <input
            type="checkbox"
            name="events"
            value={ev}
            defaultChecked={set.has(ev)}
            className="h-3.5 w-3.5 accent-current text-tool-accent"
          />
          <span className="font-mono text-[11px]">{ev}</span>
        </label>
      ))}
    </div>
  );
}
