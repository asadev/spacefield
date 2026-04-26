"use client";

/* useKeyboardShortcuts — global keyboard shortcut registry for /tools.
 *
 * Pass a config object keyed by shortcut spec → handler. The hook binds
 * a single document-level keydown listener and dispatches based on the
 * event. Shortcuts use a normalised lowercase string with `+` as the
 * combiner. Tokens:
 *
 *   cmd / meta — Cmd on macOS, Ctrl on Windows/Linux (auto-detected)
 *   ctrl       — literal Ctrl on every platform
 *   shift      — Shift
 *   alt / opt  — Alt / Option
 *   <key>      — printable key (a–z, 0–9), or special: escape, enter,
 *                tab, space, up, down, left, right, comma, slash, etc.
 *
 * Examples: "cmd+k", "cmd+shift+d", "?", "escape", "cmd+/", "cmd+left".
 *
 * Behaviour:
 *   – Skips the dispatch entirely while the user is typing in an
 *     <input>, <textarea>, <select>, or any contenteditable surface, so
 *     ⌘K still works in chrome but `?` doesn't fire while typing prose.
 *     `escape` is exempt — modals always need to dismiss.
 *   – Calls `preventDefault()` only when a registered handler matched.
 *   – Returns the active list so the cheat-sheet dialog can render
 *     whatever the caller actually wired up. */

import { useEffect, useMemo, useRef } from "react";

export type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutMap = Record<string, ShortcutHandler>;

export interface ActiveShortcut {
  /** Raw spec the caller registered, e.g. "cmd+shift+d". */
  spec: string;
  /** Pretty display string with platform glyphs, e.g. "⌘ ⇧ D". */
  display: string;
}

const isMac = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
};

/* Map of common key-name aliases → canonical KeyboardEvent.key, lowercase.
 * Only used for parsing the spec — the dispatch side normalises e.key
 * the same way before comparing. */
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  escape: "escape",
  ret: "enter",
  return: "enter",
  enter: "enter",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  arrowleft: "arrowleft",
  arrowright: "arrowright",
  comma: ",",
  period: ".",
  slash: "/",
  questionmark: "?",
  question: "?",
  plus: "+",
  minus: "-",
  equals: "=",
  equal: "=",
  backslash: "\\",
  tab: "tab",
  delete: "delete",
  backspace: "backspace",
};

interface ParsedShortcut {
  spec: string;
  cmd: boolean; // matches metaKey on Mac, ctrlKey on Win/Linux
  ctrl: boolean; // explicit Ctrl on every platform
  shift: boolean;
  alt: boolean;
  key: string; // canonical lowercase key
}

function parseSpec(raw: string): ParsedShortcut {
  const parts = raw.toLowerCase().trim().split("+").map((p) => p.trim());
  let cmd = false;
  let ctrl = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const p of parts) {
    if (p === "cmd" || p === "meta" || p === "command") cmd = true;
    else if (p === "ctrl" || p === "control") ctrl = true;
    else if (p === "shift") shift = true;
    else if (p === "alt" || p === "opt" || p === "option") alt = true;
    else key = KEY_ALIASES[p] ?? p;
  }
  return { spec: raw, cmd, ctrl, shift, alt, key };
}

/* True if the user is currently typing into an editable surface. We
 * deliberately don't treat <button> focus as editable so ⌘K still fires
 * when a button has focus. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/* Pretty-print a shortcut for display in the cheat sheet. ⌘ ⇧ ⌥ ⌃
 * glyphs on Mac, words on Win/Linux. */
function prettify(spec: string, mac: boolean): string {
  const p = parseSpec(spec);
  const out: string[] = [];
  if (p.cmd) out.push(mac ? "⌘" : "Ctrl");
  if (p.ctrl) out.push(mac ? "⌃" : "Ctrl");
  if (p.alt) out.push(mac ? "⌥" : "Alt");
  if (p.shift) out.push(mac ? "⇧" : "Shift");
  out.push(prettyKey(p.key));
  return out.join(mac ? " " : "+");
}

function prettyKey(k: string): string {
  switch (k) {
    case "escape":
      return "Esc";
    case "enter":
      return "Enter";
    case "tab":
      return "Tab";
    case " ":
      return "Space";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "delete":
      return "Del";
    case "backspace":
      return "⌫";
    default:
      return k.length === 1 ? k.toUpperCase() : k;
  }
}

/* Normalise the actual KeyboardEvent.key to the same canonical form we
 * parsed the spec into, so comparison is a cheap === check. */
function normalKey(e: KeyboardEvent): string {
  const k = e.key;
  if (!k) return "";
  // Arrow keys come in as "ArrowUp" etc.
  return k.toLowerCase();
}

export function useKeyboardShortcuts(map: ShortcutMap): ActiveShortcut[] {
  // Keep the latest map in a ref so the listener never goes stale, but
  // we don't have to re-bind on every render either.
  const mapRef = useRef<ShortcutMap>(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = mapRef.current;
      const editable = isEditableTarget(e.target);
      const k = normalKey(e);
      if (!k) return;

      // Walk every registered spec. We don't bother with a hash table
      // because a) the map is tiny and b) `cmd+x` matches metaKey OR
      // ctrlKey at runtime, so a hash key would need both encodings.
      for (const spec of Object.keys(current)) {
        const parsed = parseSpec(spec);

        // cmd in spec = metaKey (Mac) OR ctrlKey (Win/Linux)
        const cmdMatches = parsed.cmd
          ? e.metaKey || e.ctrlKey
          : !e.metaKey;
        // explicit ctrl = ctrlKey only, regardless of platform
        const ctrlMatches = parsed.ctrl ? e.ctrlKey : true;
        // If neither cmd nor ctrl is in the spec, the user must NOT be
        // holding either — otherwise `?` would fire on ⌘?.
        const anyMod = parsed.cmd || parsed.ctrl;
        if (!anyMod && (e.metaKey || e.ctrlKey)) continue;

        if (parsed.cmd && !cmdMatches) continue;
        if (parsed.ctrl && !ctrlMatches) continue;
        if (parsed.shift !== e.shiftKey) continue;
        if (parsed.alt !== e.altKey) continue;

        // Key compare. For "?" the browser may report key "?" directly
        // (Mac) OR "/" + shiftKey (some layouts) — handle both.
        const keyMatches =
          k === parsed.key ||
          (parsed.key === "?" && k === "/" && e.shiftKey);
        if (!keyMatches) continue;

        // Skip handlers when typing — except Escape, which always wins.
        if (editable && parsed.key !== "escape") continue;

        e.preventDefault();
        try {
          current[spec](e);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[useKeyboardShortcuts] handler for ${spec} threw`, err);
        }
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Active list for the cheat-sheet UI. Memoise on the spec keys so the
  // dialog doesn't churn unless registrations actually changed.
  const specs = Object.keys(map).join("|");
  const active = useMemo<ActiveShortcut[]>(() => {
    const mac = isMac();
    return Object.keys(map).map((spec) => ({
      spec,
      display: prettify(spec, mac),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs]);

  return active;
}

/* Helper exported for the dialog's static cheat sheet, so we can render
 * pretty key glyphs without registering a no-op handler. */
export function formatShortcut(spec: string): string {
  return prettify(spec, isMac());
}
