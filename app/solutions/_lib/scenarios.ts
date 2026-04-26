// Shared scenario / export helpers used by finance tools.
// Keep dependency-free. Each helper is pure or touches only localStorage /
// browser APIs. Safe to use from "use client" components.

export interface NamedScenario<T> {
  id: string;
  name: string;
  createdAt: number;
  data: T;
}

const KEY = (slug: string) => `solutions:${slug}:scenarios:v1`;

export function loadScenarios<T>(slug: string): NamedScenario<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NamedScenario<T>[]) : [];
  } catch {
    return [];
  }
}

export function saveScenarios<T>(slug: string, scenarios: NamedScenario<T>[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(scenarios));
  } catch {
    // Quota / privacy-mode: fail silently, the UI remains usable.
  }
}

export function addScenario<T>(
  slug: string,
  name: string,
  data: T
): NamedScenario<T>[] {
  const list = loadScenarios<T>(slug);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const next: NamedScenario<T> = {
    id,
    name: name || `Scenario ${list.length + 1}`,
    createdAt: Date.now(),
    data,
  };
  const merged = [next, ...list].slice(0, 30);
  saveScenarios(slug, merged);
  return merged;
}

export function removeScenario<T>(slug: string, id: string): NamedScenario<T>[] {
  const list = loadScenarios<T>(slug).filter((s) => s.id !== id);
  saveScenarios(slug, list);
  return list;
}

// --- Pro-aware scenario cap ------------------------------------------------
// Free users: 5 saved scenarios. Pro users: 50. The cap is a soft limit —
// ScenarioBar calls canAddScenario() before addScenario() and surfaces the
// upgrade nudge if at limit. This lives here (vs lib/pro/features.ts) so
// scenarios.ts stays dependency-free and the caller decides on isPro.
export const SCENARIO_LIMIT_FREE = 5;
export const SCENARIO_LIMIT_PRO = 50;

export function scenarioLimit(isPro: boolean): number {
  return isPro ? SCENARIO_LIMIT_PRO : SCENARIO_LIMIT_FREE;
}

export function canAddScenario(slug: string, isPro: boolean): boolean {
  return loadScenarios(slug).length < scenarioLimit(isPro);
}

// --- share URL -------------------------------------------------------------

// UTF-safe base64 (atob/btoa choke on wide chars).
export function encodeState(state: unknown): string {
  try {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  } catch {
    return "";
  }
}

export function decodeState<T>(encoded: string | null | undefined): T | null {
  if (!encoded) return null;
  try {
    const b64 =
      encoded.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (encoded.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function buildShareUrl(state: unknown): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("s", encodeState(state));
  return url.toString();
}

export function readShareState<T>(): T | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  return decodeState<T>(url.searchParams.get("s"));
}

// --- downloads -------------------------------------------------------------

export function download(filename: string, content: string, mime = "text/plain") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

// --- clipboard -------------------------------------------------------------

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
