/* Shared snap-zone geometry — used by Window.tsx (to perform the snap on
 * pointer-up) and SnapPreview.tsx (to render the translucent preview while
 * dragging). Keeping the math in one module guarantees both render the same
 * rectangle for the same cursor position. */

export const SNAP_EDGE = 24; // px from viewport edge that triggers a zone
export const SNAP_CORNER = 60; // corner zones are wider (need both axes)
export const TOPBAR = 32;

export type SnapZone =
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface SnapResult {
  zone: SnapZone;
  rect: { x: number; y: number; w: number; h: number };
}

/* Resolve cursor position to a snap zone + the rectangle the window will
 * occupy after release. Returns null if the cursor isn't in any zone.
 * Corners take priority over edges (they're tested first). */
export function computeSnapRect(cx: number, cy: number): SnapResult | null {
  if (typeof window === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const usableH = vh - TOPBAR;

  const nearLeft = cx <= SNAP_CORNER;
  const nearRight = cx >= vw - SNAP_CORNER;
  const nearTop = cy <= SNAP_CORNER;
  const nearBottom = cy >= vh - SNAP_CORNER;

  // Corner zones first — both axes within SNAP_CORNER. We use the wider
  // corner threshold for diagonals so they're easier to hit than the edge
  // strips that flank them.
  if (nearTop && nearLeft && cy <= SNAP_EDGE * 2 && cx <= SNAP_EDGE * 2) {
    return {
      zone: "top-left",
      rect: { x: 0, y: TOPBAR, w: Math.floor(vw / 2), h: Math.floor(usableH / 2) },
    };
  }
  if (nearTop && nearRight && cy <= SNAP_EDGE * 2 && cx >= vw - SNAP_EDGE * 2) {
    return {
      zone: "top-right",
      rect: {
        x: Math.floor(vw / 2),
        y: TOPBAR,
        w: Math.ceil(vw / 2),
        h: Math.floor(usableH / 2),
      },
    };
  }
  if (nearBottom && nearLeft && cy >= vh - SNAP_EDGE * 2 && cx <= SNAP_EDGE * 2) {
    return {
      zone: "bottom-left",
      rect: {
        x: 0,
        y: TOPBAR + Math.floor(usableH / 2),
        w: Math.floor(vw / 2),
        h: Math.ceil(usableH / 2),
      },
    };
  }
  if (nearBottom && nearRight && cy >= vh - SNAP_EDGE * 2 && cx >= vw - SNAP_EDGE * 2) {
    return {
      zone: "bottom-right",
      rect: {
        x: Math.floor(vw / 2),
        y: TOPBAR + Math.floor(usableH / 2),
        w: Math.ceil(vw / 2),
        h: Math.ceil(usableH / 2),
      },
    };
  }

  // Edge strips — the cursor only needs to be within SNAP_EDGE of the edge.
  // Top edge → maximize covers the entire viewport (including topbar) to
  // match the existing toggleMaximize behavior.
  if (cy <= SNAP_EDGE) {
    return { zone: "top", rect: { x: 0, y: 0, w: vw, h: vh } };
  }
  if (cx <= SNAP_EDGE) {
    return {
      zone: "left",
      rect: { x: 0, y: TOPBAR, w: Math.floor(vw / 2), h: usableH },
    };
  }
  if (cx >= vw - SNAP_EDGE) {
    return {
      zone: "right",
      rect: {
        x: Math.floor(vw / 2),
        y: TOPBAR,
        w: Math.ceil(vw / 2),
        h: usableH,
      },
    };
  }

  return null;
}

/* Detect whether a window already matches a snap rect. Used to know if the
 * user is dragging a snapped window away (so we can restore its prev size). */
export function rectMatchesSnap(
  win: { x: number; y: number; w: number; h: number },
): boolean {
  if (typeof window === "undefined") return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const usableH = vh - TOPBAR;
  const halfW = Math.floor(vw / 2);
  const halfH = Math.floor(usableH / 2);

  // Approximate match — round-tripped state via localStorage may be off by 1.
  const eq = (a: number, b: number) => Math.abs(a - b) <= 2;

  // Maximized (top edge snap): full viewport
  if (eq(win.x, 0) && eq(win.y, 0) && eq(win.w, vw) && eq(win.h, vh)) return true;
  // Left half
  if (eq(win.x, 0) && eq(win.y, TOPBAR) && eq(win.w, halfW) && eq(win.h, usableH))
    return true;
  // Right half
  if (eq(win.x, halfW) && eq(win.y, TOPBAR) && eq(win.h, usableH)) return true;
  // Top-left quarter
  if (eq(win.x, 0) && eq(win.y, TOPBAR) && eq(win.w, halfW) && eq(win.h, halfH))
    return true;
  // Top-right quarter
  if (eq(win.x, halfW) && eq(win.y, TOPBAR) && eq(win.h, halfH)) return true;
  // Bottom-left quarter
  if (eq(win.x, 0) && eq(win.y, TOPBAR + halfH) && eq(win.w, halfW)) return true;
  // Bottom-right quarter
  if (eq(win.x, halfW) && eq(win.y, TOPBAR + halfH)) return true;

  return false;
}
