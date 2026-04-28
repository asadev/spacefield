/* Shared drag-and-drop payload + helpers for moving apps between the
 * three desktop zones (Launchpad / Dock / Home). HTML5 DnD is used so a
 * single drag gesture can cross zone boundaries — dnd-kit's collision
 * detection is overkill for three coarse zones. The payload is set on
 * `dataTransfer` under a custom MIME type plus a plain-text fallback so
 * external drops (e.g. into a chat) get a sensible string. */

export const APP_DRAG_MIME = "application/x-spacefield-app";

export type AppDragZone = "launchpad" | "dock" | "home";

export interface AppDragPayload {
  type: "spacefield-app";
  slug: string;
  fromZone: AppDragZone;
  fromIndex?: number;
}

export function setAppDragPayload(
  dt: DataTransfer,
  payload: AppDragPayload
): void {
  try {
    const json = JSON.stringify(payload);
    dt.setData(APP_DRAG_MIME, json);
    dt.setData("text/plain", payload.slug);
    dt.effectAllowed = "move";
  } catch {}
}

export function readAppDragPayload(dt: DataTransfer): AppDragPayload | null {
  try {
    const raw = dt.getData(APP_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.type === "spacefield-app" &&
      typeof parsed.slug === "string" &&
      (parsed.fromZone === "launchpad" ||
        parsed.fromZone === "dock" ||
        parsed.fromZone === "home")
    ) {
      return parsed as AppDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
