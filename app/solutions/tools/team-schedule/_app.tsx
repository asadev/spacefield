"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Team Schedule & Timezones — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Consolidates four time/scheduling tools into one sidebar-driven app:
     • World Clock           — track up to 12 cities, business-hours dial
     • Timezone Planner      — overlap finder across up to 5 zones
     • On-call Schedule      — rotation builder + ICS export
     • Meeting Cost          — attendees × rates × duration calculator

   Logic ported verbatim from the four source pages; the marketing-style
   ToolShell (hero, breadcrumbs, /pricing CTAs) is dropped in favour of an
   OS-native two-column layout. Foundation tokens only.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

/* ───────────────────────── Shared mini primitives ───────────────────────── */

function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          {label}
        </div>
        {meta && (
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            {meta}
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-app bg-app px-2.5 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent";
const btnPrimary =
  "rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent";
const btnSecondary =
  "rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent";

/* ─────────────────────── Shared timezone helpers ─────────────────────── */

// Offset in minutes from UTC for an IANA zone at `date`. DST-aware.
function tzOffsetMinutes(tz: string, date: Date | number = new Date()): number {
  const d = typeof date === "number" ? new Date(date) : date;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    );
    return Math.round((asUTC - d.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function fmtOffset(mins: number) {
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, "0")}${
    m ? ":" + String(m).padStart(2, "0") : ""
  }`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   World Clock pane
═══════════════════════════════════════════════════════════════════════════ */

interface City {
  id: string;
  label: string;
  tz: string;
}
type HourFormat = "24h" | "12h";

const WC_STORAGE_KEY = "solutions:world-clock:v1";
const WC_FORMAT_LS_KEY = "solutions:world-clock:format:v1";
const wcUid = () => Math.random().toString(36).slice(2, 9);

const WC_CITIES: { label: string; tz: string }[] = [
  { label: "Dubai", tz: "Asia/Dubai" },
  { label: "Riyadh", tz: "Asia/Riyadh" },
  { label: "London", tz: "Europe/London" },
  { label: "New York", tz: "America/New_York" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
  { label: "San Francisco", tz: "America/Los_Angeles" },
  { label: "Chicago", tz: "America/Chicago" },
  { label: "Toronto", tz: "America/Toronto" },
  { label: "Mexico City", tz: "America/Mexico_City" },
  { label: "São Paulo", tz: "America/Sao_Paulo" },
  { label: "Buenos Aires", tz: "America/Argentina/Buenos_Aires" },
  { label: "Paris", tz: "Europe/Paris" },
  { label: "Berlin", tz: "Europe/Berlin" },
  { label: "Madrid", tz: "Europe/Madrid" },
  { label: "Rome", tz: "Europe/Rome" },
  { label: "Amsterdam", tz: "Europe/Amsterdam" },
  { label: "Zurich", tz: "Europe/Zurich" },
  { label: "Stockholm", tz: "Europe/Stockholm" },
  { label: "Warsaw", tz: "Europe/Warsaw" },
  { label: "Istanbul", tz: "Europe/Istanbul" },
  { label: "Moscow", tz: "Europe/Moscow" },
  { label: "Cairo", tz: "Africa/Cairo" },
  { label: "Lagos", tz: "Africa/Lagos" },
  { label: "Nairobi", tz: "Africa/Nairobi" },
  { label: "Johannesburg", tz: "Africa/Johannesburg" },
  { label: "Tel Aviv", tz: "Asia/Jerusalem" },
  { label: "Doha", tz: "Asia/Qatar" },
  { label: "Kuwait", tz: "Asia/Kuwait" },
  { label: "Karachi", tz: "Asia/Karachi" },
  { label: "Delhi", tz: "Asia/Kolkata" },
  { label: "Mumbai", tz: "Asia/Kolkata" },
  { label: "Bengaluru", tz: "Asia/Kolkata" },
  { label: "Dhaka", tz: "Asia/Dhaka" },
  { label: "Bangkok", tz: "Asia/Bangkok" },
  { label: "Jakarta", tz: "Asia/Jakarta" },
  { label: "Singapore", tz: "Asia/Singapore" },
  { label: "Hong Kong", tz: "Asia/Hong_Kong" },
  { label: "Shanghai", tz: "Asia/Shanghai" },
  { label: "Beijing", tz: "Asia/Shanghai" },
  { label: "Seoul", tz: "Asia/Seoul" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Sydney", tz: "Australia/Sydney" },
  { label: "Melbourne", tz: "Australia/Melbourne" },
  { label: "Auckland", tz: "Pacific/Auckland" },
  { label: "Honolulu", tz: "Pacific/Honolulu" },
  { label: "Anchorage", tz: "America/Anchorage" },
  { label: "Vancouver", tz: "America/Vancouver" },
  { label: "Denver", tz: "America/Denver" },
  { label: "Phoenix", tz: "America/Phoenix" },
  { label: "Atlanta", tz: "America/New_York" },
  { label: "Miami", tz: "America/New_York" },
  { label: "Dublin", tz: "Europe/Dublin" },
  { label: "Lisbon", tz: "Europe/Lisbon" },
  { label: "Athens", tz: "Europe/Athens" },
  { label: "Abu Dhabi", tz: "Asia/Dubai" },
];

const WC_DEFAULT_CITIES: City[] = [
  { id: wcUid(), label: "Dubai", tz: "Asia/Dubai" },
  { id: wcUid(), label: "London", tz: "Europe/London" },
  { id: wcUid(), label: "New York", tz: "America/New_York" },
  { id: wcUid(), label: "Singapore", tz: "Asia/Singapore" },
];

const WC_MAX_CITIES = 12;

function getZoneParts(tz: string, now: number) {
  const d = new Date(now);
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      day: "2-digit",
      month: "short",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(d);
    const find = (type: string) =>
      parts.find((p) => p.type === type)?.value || "";
    const hour = find("hour");
    const minute = find("minute");
    const second = find("second");
    const wd = find("weekday");
    const day = find("day");
    const mo = find("month");
    const wdf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
    });
    const wdShort = wdf.format(d);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      wdShort
    );
    return {
      time: `${hour}:${minute}:${second}`,
      timeShort: `${hour}:${minute}`,
      hour24: parseInt(hour, 10),
      minute24: parseInt(minute, 10),
      second24: parseInt(second, 10),
      weekday,
      weekdayShort: wd,
      dateShort: `${day} ${mo}`,
    };
  } catch {
    return {
      time: "--:--:--",
      timeShort: "--:--",
      hour24: 0,
      minute24: 0,
      second24: 0,
      weekday: 0,
      weekdayShort: "",
      dateShort: "",
    };
  }
}

function formatTime(
  hour24: number,
  minute: number,
  second: number,
  format: HourFormat
): { time: string; timeShort: string; suffix?: string } {
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  if (format === "24h") {
    const hh = String(hour24).padStart(2, "0");
    return { time: `${hh}:${mm}:${ss}`, timeShort: `${hh}:${mm}` };
  }
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hh = String(h12).padStart(2, "0");
  return { time: `${hh}:${mm}:${ss}`, timeShort: `${hh}:${mm}`, suffix };
}

function businessStatus(
  hour: number,
  weekday: number
): "work" | "edge" | "off" {
  const weekend = weekday === 0 || weekday === 6;
  if (weekend) return "off";
  if (hour >= 9 && hour < 17) return "work";
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return "edge";
  return "off";
}

function formatOffsetDelta(tz: string, localTz: string, ts: number): string {
  const diff = tzOffsetMinutes(tz, ts) - tzOffsetMinutes(localTz, ts);
  if (diff === 0) return "same as you";
  const hrs = diff / 60;
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(hrs);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 60);
  if (frac === 0) return `${sign}${whole}h`;
  return `${sign}${whole}h ${frac}m`;
}

function dayPeriod(hour24: number): {
  label: string;
  bg: string;
  stroke: string;
  faceFrom: string;
  faceTo: string;
} {
  if (hour24 >= 5 && hour24 < 8) {
    return {
      label: "Dawn",
      bg: "bg-gradient-to-br from-amber-300/15 via-rose-300/10 to-sky-400/10",
      stroke: "rgba(251, 191, 36, 0.45)",
      faceFrom: "rgba(254, 215, 170, 0.30)",
      faceTo: "rgba(56, 189, 248, 0.22)",
    };
  }
  if (hour24 >= 8 && hour24 < 17) {
    return {
      label: "Day",
      bg: "bg-gradient-to-br from-sky-300/20 via-sky-400/10 to-cyan-300/10",
      stroke: "rgba(14, 165, 233, 0.55)",
      faceFrom: "rgba(186, 230, 253, 0.35)",
      faceTo: "rgba(14, 165, 233, 0.22)",
    };
  }
  if (hour24 >= 17 && hour24 < 20) {
    return {
      label: "Dusk",
      bg: "bg-gradient-to-br from-orange-400/20 via-rose-400/12 to-indigo-500/15",
      stroke: "rgba(244, 114, 182, 0.50)",
      faceFrom: "rgba(253, 186, 116, 0.30)",
      faceTo: "rgba(99, 102, 241, 0.25)",
    };
  }
  return {
    label: "Night",
    bg: "bg-gradient-to-br from-indigo-900/40 via-slate-900/30 to-slate-950/40",
    stroke: "rgba(148, 163, 184, 0.45)",
    faceFrom: "rgba(30, 41, 59, 0.55)",
    faceTo: "rgba(2, 6, 23, 0.65)",
  };
}

function AnalogDial({
  hour,
  minute,
  second,
  period,
}: {
  hour: number;
  minute: number;
  second: number;
  period: { stroke: string; faceFrom: string; faceTo: string };
}) {
  const size = 132;
  const c = size / 2;
  const secAngle = (second / 60) * 360;
  const minAngle = ((minute + second / 60) / 60) * 360;
  const hourAngle = (((hour % 12) + minute / 60) / 12) * 360;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="drop-shadow-sm"
      aria-hidden
    >
      <defs>
        <radialGradient
          id={`face-${period.faceFrom}-${period.faceTo}`}
          cx="0.5"
          cy="0.4"
          r="0.7"
        >
          <stop offset="0%" stopColor={period.faceFrom} />
          <stop offset="100%" stopColor={period.faceTo} />
        </radialGradient>
      </defs>
      <circle
        cx={c}
        cy={c}
        r={c - 2}
        fill={`url(#face-${period.faceFrom}-${period.faceTo})`}
        stroke={period.stroke}
        strokeWidth="1.5"
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const r1 = c - 8;
        const r2 = i % 3 === 0 ? c - 16 : c - 12;
        return (
          <line
            key={i}
            x1={c + Math.cos(a) * r1}
            y1={c + Math.sin(a) * r1}
            x2={c + Math.cos(a) * r2}
            y2={c + Math.sin(a) * r2}
            stroke={period.stroke}
            strokeWidth={i % 3 === 0 ? 1.6 : 0.9}
            strokeOpacity={i % 3 === 0 ? 0.85 : 0.45}
            strokeLinecap="round"
          />
        );
      })}
      <line
        x1={c}
        y1={c}
        x2={c}
        y2={c - (c - 32)}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-app"
        transform={`rotate(${hourAngle} ${c} ${c})`}
      />
      <line
        x1={c}
        y1={c}
        x2={c}
        y2={c - (c - 18)}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-app"
        transform={`rotate(${minAngle} ${c} ${c})`}
      />
      <line
        x1={c}
        y1={c + 6}
        x2={c}
        y2={c - (c - 14)}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        className="text-tool-accent"
        transform={`rotate(${secAngle} ${c} ${c})`}
      />
      <circle cx={c} cy={c} r="3" className="fill-tool-accent" />
      <circle cx={c} cy={c} r="1.2" className="fill-app" />
    </svg>
  );
}

function WorldClockPane() {
  const [cities, setCities] = useState<City[]>(WC_DEFAULT_CITIES);
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hourFormat, setHourFormat] = useState<HourFormat>("24h");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WC_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as City[];
        if (Array.isArray(parsed)) setCities(parsed);
      }
      const f = localStorage.getItem(WC_FORMAT_LS_KEY);
      if (f === "12h" || f === "24h") setHourFormat(f);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WC_STORAGE_KEY, JSON.stringify(cities));
      localStorage.setItem(WC_FORMAT_LS_KEY, hourFormat);
    } catch {
      /* ignore */
    }
  }, [cities, hourFormat, hydrated]);

  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const localTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return WC_CITIES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const addCity = (c: { label: string; tz: string }) => {
    if (cities.length >= WC_MAX_CITIES) return;
    setCities((prev) => [...prev, { id: wcUid(), ...c }]);
    setQuery("");
  };
  const remove = (id: string) =>
    setCities((prev) => prev.filter((c) => c.id !== id));

  const sorted = useMemo(() => {
    const localOffset = tzOffsetMinutes(localTz, now);
    return [...cities].sort(
      (a, b) =>
        tzOffsetMinutes(a.tz, now) -
        localOffset -
        (tzOffsetMinutes(b.tz, now) - localOffset)
    );
  }, [cities, now, localTz]);

  const heroCities = sorted.slice(0, 4);
  const tileCities = sorted.slice(4);

  const inBusiness = sorted.filter((c) => {
    const p = getZoneParts(c.tz, now);
    return businessStatus(p.hour24, p.weekday) === "work";
  }).length;

  return (
    <div data-tool-theme="productivity" data-tool="world-clock" className="space-y-5">
      {/* Masthead */}
      <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            tz:{localTz.split("/").pop()?.toLowerCase() || "local"}
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {cities.length}/{WC_MAX_CITIES} cities
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            world.clock
            <span className="text-faint">/</span>
            <span className="text-secondary">live.tick</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ live" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Live dial board · multi-zone
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {heroCities.length} primary
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {tileCities.length} secondary
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {WC_MAX_CITIES - cities.length} slots free
                </span>
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold tracking-tight text-app">
                {heroCities.length > 0
                  ? heroCities.map((c) => c.label).join(" · ")
                  : "Add a city to start"}
              </h2>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="var(--tool-accent)"
                    strokeWidth="3"
                    strokeDasharray={`${
                      cities.length > 0 ? (inBusiness / cities.length) * 100 : 0
                    }, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                  {inBusiness}
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  In business hrs
                </div>
                <div className="text-sm font-semibold text-app">
                  {inBusiness} / {cities.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-app bg-app px-4 py-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add a city or timezone…"
              disabled={cities.length >= WC_MAX_CITIES}
              className={`${inputCls} pl-8 disabled:opacity-50`}
            />
            {filtered.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-app bg-app-elevated p-1 shadow-xl">
                {filtered.map((c) => (
                  <button
                    type="button"
                    key={`${c.label}-${c.tz}`}
                    onClick={() => addCity(c)}
                    disabled={cities.length >= WC_MAX_CITIES}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-secondary transition-colors hover:bg-tool-accent-soft hover:text-tool-accent disabled:opacity-40"
                  >
                    <span>{c.label}</span>
                    <span className="font-mono text-[0.6rem] text-faint">
                      {c.tz}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {filtered.length === 0 && query && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-app bg-app-elevated px-3 py-2 text-xs text-muted">
                No matches.
              </div>
            )}
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(["24h", "12h"] as HourFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setHourFormat(f)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  hourFormat === f
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Hero dial board */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {heroCities.map((c) => {
          const parts = getZoneParts(c.tz, now);
          const status = businessStatus(parts.hour24, parts.weekday);
          const offset = formatOffsetDelta(c.tz, localTz, now);
          const period = dayPeriod(parts.hour24);
          const display = formatTime(
            parts.hour24,
            parts.minute24,
            parts.second24,
            hourFormat
          );
          return (
            <div
              key={c.id}
              className="group relative overflow-hidden rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent"
            >
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-app text-faint opacity-0 transition-all hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                aria-label="Remove city"
              >
                ×
              </button>
              <div className="flex items-baseline justify-between pr-7">
                <div className="text-base font-semibold tracking-tight text-app">
                  {c.label}
                </div>
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                  {offset === "same as you" ? "local" : offset}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                {c.tz}
              </div>
              <div className="mt-3 flex justify-center">
                <AnalogDial
                  hour={parts.hour24}
                  minute={parts.minute24}
                  second={parts.second24}
                  period={period}
                />
              </div>
              <div className="mt-3 text-center">
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="font-mono text-2xl tabular-nums tracking-tight text-app">
                    {display.time}
                  </span>
                  {display.suffix && (
                    <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                      {display.suffix}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  {parts.weekdayShort} · {parts.dateShort}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-app pt-3">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status === "work"
                      ? "bg-emerald-500"
                      : status === "edge"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
                <span className="text-[0.65rem] text-secondary">
                  {status === "work"
                    ? "Business hours"
                    : status === "edge"
                      ? "Near business"
                      : "Off hours"}
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                  · {period.label}
                </span>
              </div>
            </div>
          );
        })}
        {heroCities.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-app bg-app-elevated px-6 py-10 text-center text-sm text-muted">
            Search a city above to start the dial board.
          </div>
        )}
      </section>

      {/* Secondary tiles */}
      {tileCities.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              ▾ secondary cities · digital
            </div>
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {tileCities.length} / {WC_MAX_CITIES - 4}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {tileCities.map((c) => {
              const parts = getZoneParts(c.tz, now);
              const status = businessStatus(parts.hour24, parts.weekday);
              const offset = formatOffsetDelta(c.tz, localTz, now);
              const display = formatTime(
                parts.hour24,
                parts.minute24,
                0,
                hourFormat
              );
              return (
                <div
                  key={c.id}
                  className="group relative overflow-hidden rounded-lg border border-app bg-app px-3 py-2.5 transition-colors hover:border-tool-accent"
                >
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-faint opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-500 group-hover:opacity-100"
                    aria-label="Remove city"
                  >
                    ×
                  </button>
                  <div className="flex items-center justify-between gap-1 pr-5">
                    <span className="truncate text-xs font-semibold text-app">
                      {c.label}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                        status === "work"
                          ? "bg-emerald-500"
                          : status === "edge"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                    />
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-mono text-base tabular-nums tracking-tight text-app">
                      {display.timeShort}
                    </span>
                    {display.suffix && (
                      <span className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-tool-accent">
                        {display.suffix}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.14em] text-muted">
                    <span>{parts.weekdayShort}</span>
                    <span className="text-tool-accent">
                      {offset === "same as you" ? "local" : offset}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {cities.length === 0 && (
        <Section label="empty">
          <div className="py-8 text-center text-sm text-muted">
            Add a city to start.
          </div>
        </Section>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
          indicators
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          9–17 weekday
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Within 2h of business
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Off / asleep / weekend
        </span>
      </div>

      {/* Meeting finder */}
      {cities.length >= 2 && (
        <Section label="meeting.finder" meta="best overlap">
          {(() => {
            const rows = cities.map((c) => {
              const offset = tzOffsetMinutes(c.tz, now);
              return { city: c, offset };
            });
            const hoursInWork = (utcHour: number) =>
              rows.every(({ offset }) => {
                let local = (utcHour + offset / 60) % 24;
                if (local < 0) local += 24;
                return local >= 9 && local < 17;
              });
            const edges = (utcHour: number) =>
              rows.every(({ offset }) => {
                let local = (utcHour + offset / 60) % 24;
                if (local < 0) local += 24;
                return local >= 7 && local < 19;
              });
            let best:
              | { start: number; len: number; tier: "work" | "edge" }
              | null = null;
            for (const tier of ["work", "edge"] as const) {
              const test = tier === "work" ? hoursInWork : edges;
              let run = -1;
              for (let i = 0; i < 48; i++) {
                const h = i % 24;
                if (test(h)) {
                  if (run === -1) run = i;
                  const len = i - run + 1;
                  if (!best || best.tier !== tier || len > best.len) {
                    best = { start: run % 24, len, tier };
                  }
                } else {
                  run = -1;
                }
              }
              if (best) break;
            }
            if (!best) {
              return (
                <div className="text-sm text-secondary">
                  No shared 9-to-17 overlap even with a 7–19 extended window.
                  Some of these cities are truly antipodal — split into two
                  meetings or accept an off-hours slot.
                </div>
              );
            }
            const endUtc = (best.start + best.len) % 24;
            return (
              <>
                <div className="text-sm text-app">
                  Best{" "}
                  <span
                    className={
                      best.tier === "work"
                        ? "text-emerald-500"
                        : "text-amber-500"
                    }
                  >
                    {best.tier === "work"
                      ? "business-hours"
                      : "extended-hours"}
                  </span>{" "}
                  overlap:{" "}
                  <span className="font-mono text-tool-accent">
                    UTC {String(best.start).padStart(2, "0")}:00–
                    {String(endUtc).padStart(2, "0")}:00
                  </span>{" "}
                  ({best.len}h)
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {rows.map(({ city, offset }) => {
                    const localStart =
                      (((best!.start + offset / 60) % 24) + 24) % 24;
                    const localEnd =
                      (((best!.start + best!.len + offset / 60) % 24) + 24) %
                      24;
                    const fmtH = (h: number) => {
                      const int = Math.floor(h);
                      const m = Math.round((h - int) * 60);
                      return `${String(int).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    };
                    return (
                      <div
                        key={city.id}
                        className="flex items-baseline justify-between rounded-lg border border-app bg-app p-2.5 text-sm"
                      >
                        <span className="text-secondary">{city.label}</span>
                        <span className="font-mono text-tool-accent">
                          {fmtH(localStart)} – {fmtH(localEnd)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </Section>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Timezone Planner pane
═══════════════════════════════════════════════════════════════════════════ */

const TZP_ZONES = [
  { tz: "Pacific/Honolulu", label: "Honolulu" },
  { tz: "America/Anchorage", label: "Anchorage" },
  { tz: "America/Los_Angeles", label: "Los Angeles" },
  { tz: "America/Denver", label: "Denver" },
  { tz: "America/Chicago", label: "Chicago" },
  { tz: "America/New_York", label: "New York" },
  { tz: "America/Toronto", label: "Toronto" },
  { tz: "America/Sao_Paulo", label: "São Paulo" },
  { tz: "Europe/London", label: "London" },
  { tz: "Europe/Paris", label: "Paris / Berlin" },
  { tz: "Europe/Istanbul", label: "Istanbul" },
  { tz: "Africa/Johannesburg", label: "Johannesburg" },
  { tz: "Asia/Dubai", label: "Dubai" },
  { tz: "Asia/Karachi", label: "Karachi" },
  { tz: "Asia/Kolkata", label: "Mumbai / Delhi" },
  { tz: "Asia/Bangkok", label: "Bangkok" },
  { tz: "Asia/Singapore", label: "Singapore" },
  { tz: "Asia/Shanghai", label: "Shanghai" },
  { tz: "Asia/Tokyo", label: "Tokyo" },
  { tz: "Australia/Sydney", label: "Sydney" },
  { tz: "Pacific/Auckland", label: "Auckland" },
];

function TimezonePlannerPane() {
  const [selected, setSelected] = useState<string[]>([
    "America/New_York",
    "Europe/London",
    "Asia/Dubai",
  ]);
  const [workStart, setWorkStart] = useState("9");
  const [workEnd, setWorkEnd] = useState("18");

  const now = useMemo(() => new Date(), []);

  const zoneData = useMemo(() => {
    return selected.map((tz) => {
      const offset = tzOffsetMinutes(tz, now);
      return {
        tz,
        label: TZP_ZONES.find((z) => z.tz === tz)?.label ?? tz,
        offsetMin: offset,
      };
    });
  }, [selected, now]);

  const startH = Math.max(0, Math.min(23, parseInt(workStart) || 0));
  const endH = Math.max(startH + 1, Math.min(24, parseInt(workEnd) || 0));

  const grid = useMemo(() => {
    const rows = zoneData.map((z) => {
      return {
        ...z,
        hours: Array.from({ length: 24 }, (_, utcHour) => {
          let local = (utcHour + z.offsetMin / 60) % 24;
          if (local < 0) local += 24;
          const inWork = local >= startH && local < endH;
          return { utcHour, local, inWork };
        }),
      };
    });
    const overlap = Array.from({ length: 24 }, (_, utcHour) =>
      rows.every((r) => r.hours[utcHour].inWork)
    );
    return { rows, overlap };
  }, [zoneData, startH, endH]);

  const bestWindow = useMemo(() => {
    const overlap = grid.overlap;
    let best: { start: number; len: number } | null = null;
    let curStart = -1;
    for (let i = 0; i < 48; i++) {
      const h = i % 24;
      if (overlap[h]) {
        if (curStart === -1) curStart = i;
        const len = i - curStart + 1;
        if (!best || len > best.len) best = { start: curStart % 24, len };
      } else {
        curStart = -1;
      }
    }
    return best;
  }, [grid.overlap]);

  const formatLocalHour = (h: number) => {
    const int = Math.floor(h);
    const m = Math.round((h - int) * 60);
    return `${String(int).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const toggleZone = (tz: string) => {
    setSelected((prev) =>
      prev.includes(tz)
        ? prev.filter((z) => z !== tz)
        : prev.length >= 5
          ? prev
          : [...prev, tz]
    );
  };

  const [meetingUtcHour, setMeetingUtcHour] = useState<number>(14);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (bestWindow) setMeetingUtcHour(bestWindow.start);
  }, [bestWindow?.start, bestWindow?.len]);

  const setMeetingFromClientX = (clientX: number) => {
    const el = bandRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const frac = x / rect.width;
    const hour = Math.round(frac * 24 * 4) / 4;
    setMeetingUtcHour(Math.max(0, Math.min(23.75, hour)));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setMeetingFromClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    const onTouch = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      if (e.touches[0]) setMeetingFromClientX(e.touches[0].clientX);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  const cityGradient = (localHour: number) => {
    const h = ((localHour % 24) + 24) % 24;
    if (h < 5)
      return "linear-gradient(160deg, #0b1437 0%, #1a1147 60%, #2a1659 100%)";
    if (h < 7)
      return "linear-gradient(160deg, #2a1f4a 0%, #5b3262 50%, #d97455 100%)";
    if (h < 11)
      return "linear-gradient(160deg, #f6c177 0%, #f0a060 50%, #5fb6e0 100%)";
    if (h < 16)
      return "linear-gradient(160deg, #87cefa 0%, #4ea7d8 50%, #2563a8 100%)";
    if (h < 19)
      return "linear-gradient(160deg, #ffb37a 0%, #f07a4d 50%, #6e2c6b 100%)";
    if (h < 21)
      return "linear-gradient(160deg, #5b3262 0%, #2a1659 60%, #131046 100%)";
    return "linear-gradient(160deg, #131046 0%, #0b1437 60%, #050823 100%)";
  };

  const isDaytime = (h: number) => {
    const x = ((h % 24) + 24) % 24;
    return x >= 6 && x < 19;
  };

  const localHourFor = (offsetMin: number) => {
    const utcMs = now.getTime();
    const local = new Date(utcMs + offsetMin * 60_000);
    return (
      local.getUTCHours() +
      local.getUTCMinutes() / 60 +
      local.getUTCSeconds() / 3600
    );
  };

  const SmallAnalogClock = ({
    hourDecimal,
    day,
  }: {
    hourDecimal: number;
    day: boolean;
  }) => {
    const h = ((hourDecimal % 24) + 24) % 24;
    const min = (h % 1) * 60;
    const hourAng = ((h % 12) + min / 60) * 30;
    const minAng = min * 6;
    const stroke = day ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.92)";
    const ring = day ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.22)";
    const tick = day ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.45)";
    return (
      <svg viewBox="0 0 100 100" className="h-16 w-16 sm:h-20 sm:w-20">
        <circle cx="50" cy="50" r="46" fill="none" stroke={ring} strokeWidth="2" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x1 = 50 + Math.sin(a) * 42;
          const y1 = 50 - Math.cos(a) * 42;
          const x2 = 50 + Math.sin(a) * (i % 3 === 0 ? 36 : 39);
          const y2 = 50 - Math.cos(a) * (i % 3 === 0 ? 36 : 39);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={tick}
              strokeWidth={i % 3 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <line
          x1="50"
          y1="50"
          x2={50 + Math.sin((hourAng * Math.PI) / 180) * 24}
          y2={50 - Math.cos((hourAng * Math.PI) / 180) * 24}
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <line
          x1="50"
          y1="50"
          x2={50 + Math.sin((minAng * Math.PI) / 180) * 34}
          y2={50 - Math.cos((minAng * Math.PI) / 180) * 34}
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="50" cy="50" r="2.6" fill={stroke} />
      </svg>
    );
  };

  const meetingLocalFor = (offsetMin: number) => {
    const local = (((meetingUtcHour + offsetMin / 60) % 24) + 24) % 24;
    return local;
  };

  return (
    <div
      data-tool-theme="productivity"
      data-tool="time-zone-planner"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tool-accent-soft ring-1 ring-tool-accent/30">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-tool-accent"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
              <path d="M3 12h2M19 12h2M12 3v2M12 19v2" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-app">Meeting Planner</div>
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
              Multi-city · DST-aware · Live
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-3 py-1 text-[0.7rem] font-medium text-tool-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
            {zoneData.length} {zoneData.length === 1 ? "city" : "cities"}
          </span>
          <span className="hidden rounded-full border border-app bg-app px-3 py-1 text-[0.7rem] text-secondary sm:inline-flex">
            Working {String(startH).padStart(2, "0")}:00 –{" "}
            {String(endH).padStart(2, "0")}:00
          </span>
        </div>
      </div>

      {/* City clocks */}
      <section className="relative overflow-hidden rounded-2xl border border-tool-accent/20 bg-app-elevated p-4 sm:p-6">
        <div className="relative">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[0.65rem] uppercase tracking-[0.22em] text-secondary">
              City clocks
            </div>
            <div className="text-[0.65rem] uppercase tracking-[0.22em] text-muted">
              Now
            </div>
          </div>

          {zoneData.length === 0 ? (
            <div className="rounded-xl border border-app bg-app-elevated p-8 text-center text-sm text-secondary">
              Pick at least one city from the panel below.
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(zoneData.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {zoneData.map((z) => {
                const lh = localHourFor(z.offsetMin);
                const day = isDaytime(lh);
                const intH = Math.floor(lh);
                const intM = Math.floor((lh - intH) * 60);
                return (
                  <div
                    key={z.tz}
                    className="relative overflow-hidden rounded-2xl border border-app p-3 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
                    style={{ background: cityGradient(lh) }}
                  >
                    <div className="absolute right-2 top-2 opacity-80">
                      {day ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.85)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="4" />
                          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.85)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-2 text-center">
                      <SmallAnalogClock hourDecimal={lh} day={day} />
                      <div className="font-mono text-lg font-semibold tabular-nums text-white drop-shadow">
                        {String(intH).padStart(2, "0")}
                        <span className="opacity-70">:</span>
                        {String(intM).padStart(2, "0")}
                      </div>
                      <div className="text-xs font-medium text-white/95 drop-shadow">
                        {z.label}
                      </div>
                      <span className="rounded-full border border-white/30 bg-black/20 px-2 py-0.5 font-mono text-[0.6rem] tracking-wide text-white/95">
                        {fmtOffset(z.offsetMin)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Overlap band with draggable meeting picker */}
      {zoneData.length > 0 && (
        <section className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-app">
                24-hour overlap band
              </h2>
              <p className="text-xs text-secondary">
                Tinted segments are inside everyone&apos;s working hours. Drag the
                marker to pick a meeting time.
              </p>
            </div>
            <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-tool-accent">
              Meeting · UTC {formatLocalHour(meetingUtcHour)}
            </div>
          </div>

          <div
            className="mb-1 grid text-[0.55rem] uppercase tracking-wide text-muted"
            style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="text-center">
                {i % 3 === 0 ? String(i).padStart(2, "0") : "·"}
              </div>
            ))}
          </div>

          <div
            ref={bandRef}
            onMouseDown={(e) => {
              draggingRef.current = true;
              setMeetingFromClientX(e.clientX);
            }}
            onTouchStart={(e) => {
              draggingRef.current = true;
              if (e.touches[0]) setMeetingFromClientX(e.touches[0].clientX);
            }}
            className="relative h-16 w-full cursor-pointer select-none overflow-hidden rounded-xl border border-app bg-app"
          >
            <div className="absolute inset-0 flex">
              {Array.from({ length: 24 }).map((_, i) => {
                const count = grid.rows.reduce(
                  (acc, r) => acc + (r.hours[i].inWork ? 1 : 0),
                  0
                );
                const frac = grid.rows.length ? count / grid.rows.length : 0;
                const isFull = grid.overlap[i];
                return (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      background: isFull
                        ? "color-mix(in srgb, var(--tool-accent) 32%, transparent)"
                        : frac > 0
                          ? `color-mix(in srgb, var(--tool-accent) ${Math.round(frac * 14)}%, transparent)`
                          : "transparent",
                    }}
                    title={`UTC ${String(i).padStart(2, "0")}:00 — ${count}/${grid.rows.length} in work hours`}
                  />
                );
              })}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-app" />
            <div className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-app last:border-r-0"
                />
              ))}
            </div>

            {(() => {
              const utcNow = now.getUTCHours() + now.getUTCMinutes() / 60;
              const left = (utcNow / 24) * 100;
              return (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-app"
                  style={{ left: `${left}%` }}
                  title={`Now — UTC ${formatLocalHour(utcNow)}`}
                >
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-app shadow" />
                </div>
              );
            })()}

            {(() => {
              const left = (meetingUtcHour / 24) * 100;
              return (
                <div
                  className="pointer-events-none absolute top-0 bottom-0"
                  style={{ left: `${left}%` }}
                >
                  <div className="absolute inset-y-0 -translate-x-1/2 w-[3px] bg-tool-accent shadow-[0_0_18px_rgba(0,0,0,0.4)]" />
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-md border border-tool-accent bg-tool-accent px-1.5 py-0.5 text-[0.6rem] font-semibold text-white shadow">
                    {formatLocalHour(meetingUtcHour)}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm border border-tool-accent bg-tool-accent" />
                </div>
              );
            })()}
          </div>

          <div className="mt-3 space-y-1">
            {grid.rows.map((row) => (
              <div key={row.tz} className="flex items-center gap-2">
                <div className="w-24 truncate text-xs text-secondary">
                  {row.label}
                  <span className="ml-1 font-mono text-[0.55rem] uppercase tracking-wide text-muted">
                    {fmtOffset(row.offsetMin)}
                  </span>
                </div>
                <div className="flex flex-1 gap-[2px]">
                  {row.hours.map((h, i) => (
                    <div
                      key={i}
                      title={`UTC ${String(i).padStart(2, "0")}:00 → ${formatLocalHour(h.local)} local`}
                      className="h-5 flex-1 rounded-sm"
                      style={{
                        background: h.inWork
                          ? "color-mix(in srgb, var(--tool-accent) 35%, transparent)"
                          : "color-mix(in srgb, currentColor 6%, transparent)",
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-tool-accent/25 bg-tool-accent-soft p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent/85">
                Meeting time · local for each city
              </div>
              <button
                type="button"
                onClick={() => bestWindow && setMeetingUtcHour(bestWindow.start)}
                disabled={!bestWindow}
                className="rounded-md border border-tool-accent/40 bg-app px-2 py-0.5 text-[0.6rem] font-medium text-tool-accent transition-colors hover:bg-app-elevated disabled:cursor-not-allowed disabled:opacity-40"
              >
                Snap to best overlap
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
              {zoneData.map((z) => {
                const local = meetingLocalFor(z.offsetMin);
                const inWork = local >= startH && local < endH;
                return (
                  <div
                    key={z.tz}
                    className={`flex items-baseline justify-between rounded-md border px-2.5 py-1.5 text-sm ${
                      inWork
                        ? "border-tool-accent/30 bg-tool-accent/10"
                        : "border-rose-400/20 bg-rose-500/5"
                    }`}
                  >
                    <span className="text-app">{z.label}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        inWork ? "text-tool-accent" : "text-rose-400"
                      }`}
                    >
                      {formatLocalHour(local)}
                      <span className="ml-1 text-[0.55rem] uppercase tracking-wider opacity-70">
                        {inWork ? "ok" : "off-hours"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* City picker + work hours + best window */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Section label="zones" meta="up to 5">
          <div className="max-h-80 overflow-y-auto rounded-md border border-app bg-app p-2">
            <div className="grid grid-cols-1 gap-1">
              {TZP_ZONES.map((z) => {
                const active = selected.includes(z.tz);
                return (
                  <button
                    key={z.tz}
                    onClick={() => toggleZone(z.tz)}
                    className={`flex items-center justify-between rounded px-3 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/30"
                        : "text-secondary hover:bg-app-elevated hover:text-app"
                    }`}
                  >
                    <span>{z.label}</span>
                    <span className="font-mono text-[0.55rem] uppercase tracking-wide opacity-70">
                      {fmtOffset(tzOffsetMinutes(z.tz, now))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                Work start (24h)
              </span>
              <input
                type="number"
                min="0"
                max="23"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="block">
              <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                Work end (24h)
              </span>
              <input
                type="number"
                min="1"
                max="24"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
          </div>
        </Section>

        <Section label="best.window" meta="longest contiguous slot">
          <div className="rounded-xl border border-tool-accent/25 bg-tool-accent-soft p-4">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent/85">
              Best overlap (UTC)
            </div>
            {bestWindow ? (
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-tool-accent">
                {String(bestWindow.start).padStart(2, "0")}:00 –{" "}
                {String((bestWindow.start + bestWindow.len) % 24).padStart(
                  2,
                  "0"
                )}
                :00
                <span className="ml-2 font-sans text-sm font-normal text-secondary">
                  ({bestWindow.len}h window)
                </span>
              </div>
            ) : (
              <div className="mt-1 text-sm text-secondary">
                No perfect overlap — widen work hours or drop a zone.
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
              Weekly business-hours heatmap (Mon–Fri)
            </div>
            <div className="space-y-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, di) => (
                <div key={day} className="flex items-center gap-1">
                  <div className="w-10 text-[0.6rem] uppercase text-secondary">
                    {day}
                  </div>
                  <div className="flex flex-1 gap-[1px]">
                    {Array.from({ length: 24 }, (_, i) => {
                      const count = zoneData.reduce((acc, z) => {
                        let local = (i + z.offsetMin / 60) % 24;
                        if (local < 0) local += 24;
                        return acc + (local >= startH && local < endH ? 1 : 0);
                      }, 0);
                      const frac = zoneData.length
                        ? count / zoneData.length
                        : 0;
                      return (
                        <div
                          key={`${di}-${i}`}
                          className="h-3 flex-1 rounded-sm"
                          style={{
                            background:
                              frac === 0
                                ? "color-mix(in srgb, currentColor 5%, transparent)"
                                : `color-mix(in srgb, var(--tool-accent) ${Math.round(15 + frac * 55)}%, transparent)`,
                          }}
                          title={`UTC ${String(i).padStart(2, "0")}:00 — ${count}/${zoneData.length} in work hours`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[0.6rem] leading-relaxed text-muted">
              Darker = more zones in working hours. Weekends excluded; all zones
              observe DST through Intl.DateTimeFormat.
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   On-call Schedule pane
═══════════════════════════════════════════════════════════════════════════ */

type Rotation = "daily" | "weekly";
type CalendarView = "week" | "month" | "list";

interface Member {
  name: string;
  tz: string;
  pto: string[];
}

interface Swap {
  shiftIdx: number;
  newMember: string;
}

interface OncallState {
  members: Member[] | string[];
  rotation: Rotation;
  startDate: string;
  weeks: number;
  handoffTime: string;
  holidays?: string[];
  swaps?: Swap[];
}

interface Shift {
  who: string;
  start: Date;
  end: Date;
  onHoliday?: boolean;
  swapped?: boolean;
}

function normalizeMembers(ms: Member[] | string[]): Member[] {
  if (ms.length === 0) return [];
  if (typeof ms[0] === "string") {
    return (ms as string[]).map((name) => ({ name, tz: "local", pto: [] }));
  }
  return ms as Member[];
}

const ONCALL_LS_KEY = "solutions:oncall-schedule:v1";

function defaultOncallState(): OncallState {
  return {
    members: [
      { name: "Alice", tz: "local", pto: [] },
      { name: "Bob", tz: "local", pto: [] },
      { name: "Carol", tz: "local", pto: [] },
    ],
    rotation: "weekly",
    startDate: new Date().toISOString().slice(0, 10),
    weeks: 8,
    handoffTime: "09:00",
    holidays: [],
    swaps: [],
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildSchedule(s: OncallState): Shift[] {
  const members = normalizeMembers(s.members);
  if (members.length === 0) return [];
  const [hh, mm] = s.handoffTime.split(":").map(Number);
  const start = new Date(`${s.startDate}T00:00:00`);
  start.setHours(hh || 9, mm || 0, 0, 0);

  const shiftLen = s.rotation === "daily" ? 1 : 7;
  const totalShifts = s.rotation === "daily" ? s.weeks * 7 : s.weeks;
  const shifts: Shift[] = [];
  const holidays = new Set(s.holidays || []);
  const swaps = s.swaps || [];

  for (let i = 0; i < totalShifts; i++) {
    let who = members[i % members.length].name;

    let attempts = 0;
    while (attempts < members.length) {
      const m = members.find((x) => x.name === who);
      if (!m) break;
      const shiftStartDate = new Date(start);
      shiftStartDate.setDate(start.getDate() + i * shiftLen);
      const isPto = m.pto.some((d) => d === isoDate(shiftStartDate));
      if (!isPto) break;
      who = members[(i + attempts + 1) % members.length].name;
      attempts++;
    }

    const swap = swaps.find((sw) => sw.shiftIdx === i);
    const swapped = !!swap;
    if (swap) who = swap.newMember;

    const sStart = new Date(start);
    sStart.setDate(start.getDate() + i * shiftLen);
    const sEnd = new Date(sStart);
    sEnd.setDate(sStart.getDate() + shiftLen);

    let onHoliday = false;
    for (let d = new Date(sStart); d < sEnd; d.setDate(d.getDate() + 1)) {
      if (holidays.has(isoDate(d))) {
        onHoliday = true;
        break;
      }
    }

    shifts.push({ who, start: sStart, end: sEnd, onHoliday, swapped });
  }

  return shifts;
}

function toIcs(shifts: Shift[]): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//solutions//oncall//EN",
    "CALSCALE:GREGORIAN",
  ];
  shifts.forEach((s, i) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:oncall-${i}-${s.start.getTime()}@spacefield.co`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    lines.push(`DTSTART:${fmt(s.start)}`);
    lines.push(`DTEND:${fmt(s.end)}`);
    lines.push(`SUMMARY:On-call: ${s.who}`);
    lines.push("DESCRIPTION:Primary responder");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const AVATAR_PALETTE = [
  { bg: "#a3e635", ink: "#1a2e05" },
  { bg: "#86efac", ink: "#052e16" },
  { bg: "#fde047", ink: "#3f2d00" },
  { bg: "#7dd3fc", ink: "#0c2a3d" },
  { bg: "#f0abfc", ink: "#3a0d3f" },
  { bg: "#fda4af", ink: "#3a0a18" },
  { bg: "#fdba74", ink: "#3a1a05" },
  { bg: "#c4b5fd", ink: "#1c0d3a" },
];

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarFor(name: string) {
  if (!name) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[hashName(name) % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDayShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtTimeShort(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtWeekday(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function HeroStat({
  label,
  value,
  sub,
  good,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-3 py-2.5">
      <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          good
            ? "text-tool-accent"
            : warn
              ? "text-amber-300"
              : "text-app"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {sub}
        </div>
      )}
    </div>
  );
}

function CalendarListView({
  days,
  shifts,
}: {
  days: {
    date: Date;
    primary: string;
    secondary: string;
    onHoliday: boolean;
    shiftIdx: number;
  }[];
  shifts: Shift[];
}) {
  const groups: {
    primary: string;
    secondary: string;
    start: Date;
    end: Date;
    days: number;
    holidays: number;
    swapped: boolean;
  }[] = [];
  let cur: (typeof groups)[number] | null = null;
  days.forEach((d) => {
    const sw = shifts[d.shiftIdx]?.swapped || false;
    if (!cur || cur.primary !== d.primary) {
      if (cur) groups.push(cur);
      cur = {
        primary: d.primary,
        secondary: d.secondary,
        start: d.date,
        end: d.date,
        days: 1,
        holidays: d.onHoliday ? 1 : 0,
        swapped: sw,
      };
    } else {
      cur.end = d.date;
      cur.days += 1;
      if (d.onHoliday) cur.holidays += 1;
      if (sw) cur.swapped = true;
    }
  });
  if (cur) groups.push(cur);

  return (
    <ul className="space-y-1.5">
      {groups.map((g, i) => {
        const av = avatarFor(g.primary);
        const sav = avatarFor(g.secondary);
        return (
          <li
            key={i}
            className="flex items-center gap-3 rounded-md border border-app bg-app-elevated p-2.5"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
              style={{ background: av.bg, color: av.ink }}
            >
              {initials(g.primary)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-app">
                <span className="font-medium">{g.primary}</span>
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  {g.days} day{g.days === 1 ? "" : "s"}
                </span>
                {g.holidays > 0 && (
                  <span className="rounded border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-rose-200">
                    {g.holidays} hol
                  </span>
                )}
                {g.swapped && (
                  <span className="rounded border border-amber-400/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-amber-200">
                    Swap
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-muted">
                {fmtWeekday(g.start)} {fmtDayShort(g.start)}{" "}
                <span className="text-tool-accent">→</span>{" "}
                {fmtWeekday(g.end)} {fmtDayShort(g.end)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: sav.bg }}
                title={`Secondary: ${g.secondary}`}
              />
              <span className="text-[0.6rem] text-muted">
                2nd · {g.secondary}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OncallSchedulePane() {
  const [state, setState] = useState<OncallState>(defaultOncallState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<CalendarView>("month");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  // Personal-mode persistence only — workspace switcher is dropped in the
  // native app shell because /pricing-bound team flows belong on the
  // marketing pages.
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    try {
      const raw = localStorage.getItem(ONCALL_LS_KEY);
      const parsed = raw
        ? (JSON.parse(raw) as OncallState)
        : defaultOncallState();
      if (cancelled) return;
      setState({
        ...parsed,
        members: normalizeMembers(parsed.members),
        holidays: parsed.holidays || [],
        swaps: parsed.swaps || [],
      });
    } catch {
      if (!cancelled) setState(defaultOncallState());
    }
    lastSig.current = null;
    setHydrated(true);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(ONCALL_LS_KEY, sig);
      } catch {
        /* ignore */
      }
    }, 500);
  }, [state, hydrated]);

  const shifts = useMemo(() => buildSchedule(state), [state]);
  const members = normalizeMembers(state.members);

  const [memberInput, setMemberInput] = useState("");
  const [holidayInput, setHolidayInput] = useState("");

  const addMember = () => {
    const name = memberInput.trim();
    if (!name) return;
    setState({
      ...state,
      members: [...members, { name, tz: "local", pto: [] }],
    });
    setMemberInput("");
  };
  const removeMember = (i: number) => {
    setState({ ...state, members: members.filter((_, idx) => idx !== i) });
  };
  const updateMember = (i: number, patch: Partial<Member>) => {
    setState({
      ...state,
      members: members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });
  };

  const addHoliday = () => {
    if (!holidayInput) return;
    setState({
      ...state,
      holidays: Array.from(new Set([...(state.holidays || []), holidayInput])),
    });
    setHolidayInput("");
  };
  const removeHoliday = (d: string) => {
    setState({
      ...state,
      holidays: (state.holidays || []).filter((x) => x !== d),
    });
  };

  const applySwap = (shiftIdx: number, newMember: string) => {
    const without = (state.swaps || []).filter((s) => s.shiftIdx !== shiftIdx);
    if (!newMember) {
      setState({ ...state, swaps: without });
    } else {
      setState({
        ...state,
        swaps: [...without, { shiftIdx, newMember }],
      });
    }
  };

  const downloadIcs = () => {
    const ics = toIcs(shifts);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oncall.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const coverage = useMemo(() => {
    const counts = new Map<string, number>();
    shifts.forEach((s) => counts.set(s.who, (counts.get(s.who) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [shifts]);

  const fairness = useMemo(() => {
    if (coverage.length < 2 || shifts.length === 0)
      return { score: 100, stdev: 0, verdict: "—" };
    const counts = coverage.map(([, n]) => n);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const stdev = Math.sqrt(variance);
    const cv = mean > 0 ? stdev / mean : 0;
    const score = Math.max(0, Math.round(100 * (1 - cv)));
    const verdict =
      score >= 90
        ? "Excellent"
        : score >= 75
          ? "Good"
          : score >= 60
            ? "Uneven"
            : "Unfair — rebalance";
    return { score, stdev, verdict };
  }, [coverage, shifts]);

  const holidayLoad = useMemo(() => {
    const counts = new Map<string, number>();
    shifts.forEach((s) => {
      if (s.onHoliday) counts.set(s.who, (counts.get(s.who) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [shifts]);

  const calendar = useMemo(() => {
    if (shifts.length === 0 || members.length === 0)
      return {
        days: [] as {
          date: Date;
          primary: string;
          secondary: string;
          onHoliday: boolean;
          shiftIdx: number;
        }[],
        firstDow: 0,
      };

    const days: {
      date: Date;
      primary: string;
      secondary: string;
      onHoliday: boolean;
      shiftIdx: number;
    }[] = [];
    shifts.forEach((s, idx) => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const primary = s.who;
        const pIdx = members.findIndex((m) => m.name === primary);
        const secondary =
          pIdx >= 0
            ? members[(pIdx + 1) % members.length].name
            : members[0].name;
        days.push({
          date: new Date(d),
          primary,
          secondary,
          onHoliday: (state.holidays || []).includes(isoDate(d)),
          shiftIdx: idx,
        });
      }
    });

    const firstDow = days[0] ? days[0].date.getDay() : 0;
    return { days, firstDow };
  }, [shifts, members, state.holidays]);

  const totalCells = calendar.days.length + calendar.firstDow;
  const weekRows = Math.max(1, Math.ceil(totalCells / 7));
  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const firstShift = shifts[0];
  const lastShift = shifts[shifts.length - 1];
  const nextHandoff = shifts[1];

  const visibleWeekRows =
    view === "week" ? 1 : view === "month" ? weekRows : 0;

  return (
    <div
      data-tool-theme="support"
      data-tool="oncall-schedule-builder"
      className="space-y-5"
    >
      {/* Hero summary */}
      <section className="relative overflow-hidden rounded-2xl border border-tool-accent/30 bg-app-elevated p-5">
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div>
              <div className="text-[0.55rem] uppercase tracking-[0.28em] text-tool-accent">
                Currently primary
              </div>
              <div className="mt-3 flex items-center gap-4">
                {firstShift ? (
                  <>
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold ring-2 ring-tool-accent ring-offset-2 ring-offset-app-elevated"
                      style={{
                        background: avatarFor(firstShift.who).bg,
                        color: avatarFor(firstShift.who).ink,
                      }}
                    >
                      {initials(firstShift.who)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-2xl font-semibold text-app">
                        {firstShift.who}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {fmtDayShort(firstShift.start)}{" "}
                        {fmtTimeShort(firstShift.start)}
                        <span className="mx-1.5 text-tool-accent">→</span>
                        {fmtDayShort(firstShift.end)}{" "}
                        {fmtTimeShort(firstShift.end)}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1.5 text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                        {state.rotation} rotation · {state.weeks}w window
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">
                    Add members to start the rotation.
                  </div>
                )}
              </div>
            </div>

            {nextHandoff && (
              <div className="flex items-center gap-3 rounded-lg border border-app bg-app px-3 py-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{
                    background: avatarFor(nextHandoff.who).bg,
                    color: avatarFor(nextHandoff.who).ink,
                  }}
                >
                  {initials(nextHandoff.who)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                    Next handoff
                  </div>
                  <div className="truncate text-sm text-app">
                    {nextHandoff.who}{" "}
                    <span className="text-muted">
                      · {fmtWeekday(nextHandoff.start)}{" "}
                      {fmtDayShort(nextHandoff.start)} at{" "}
                      {fmtTimeShort(nextHandoff.start)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadIcs}
                disabled={shifts.length === 0}
                className="inline-flex items-center gap-2 rounded-md border border-tool-accent/40 bg-tool-accent-soft px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent hover:bg-tool-accent/20 disabled:opacity-40"
              >
                <span>↓</span> Download .ics
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <HeroStat label="Members" value={String(members.length)} />
            <HeroStat label="Shifts" value={String(shifts.length)} />
            <HeroStat
              label="Fairness"
              value={`${fairness.score}`}
              sub={fairness.verdict}
              good={fairness.score >= 75}
            />
            <HeroStat
              label="Holiday shifts"
              value={String(shifts.filter((s) => s.onHoliday).length)}
              warn={shifts.some((s) => s.onHoliday)}
            />
            <div className="col-span-2 rounded-lg border border-app bg-app px-3 py-2.5">
              <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                Coverage window
              </div>
              <div className="mt-1 text-xs text-secondary">
                {firstShift && lastShift ? (
                  <>
                    {fmtDayShort(firstShift.start)}{" "}
                    <span className="text-tool-accent">→</span>{" "}
                    {fmtDayShort(lastShift.end)}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roster + calendar grid */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Section label="team.roster" meta="members">
            <div className="flex gap-2">
              <input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                placeholder="Add a name"
                className={inputCls}
              />
              <button onClick={addMember} className={btnPrimary}>
                + Add
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {members.map((m, i) => {
                const av = avatarFor(m.name);
                const shiftCount =
                  coverage.find(([n]) => n === m.name)?.[1] || 0;
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-app bg-app-elevated p-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                        style={{ background: av.bg, color: av.ink }}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          value={m.name}
                          onChange={(e) =>
                            updateMember(i, { name: e.target.value })
                          }
                          className={`${inputCls} h-8 px-2 py-1 text-sm`}
                          placeholder="Name"
                        />
                      </div>
                      <button
                        onClick={() => removeMember(i)}
                        className="rounded-md border border-app px-2 py-1 text-xs text-muted hover:border-rose-400/40 hover:text-rose-300"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      <div className="flex items-center gap-2">
                        <span>TZ</span>
                        <input
                          value={m.tz}
                          onChange={(e) =>
                            updateMember(i, { tz: e.target.value })
                          }
                          className={`${inputCls} h-6 w-20 px-1.5 py-0 text-[0.65rem] normal-case`}
                          placeholder="PT"
                        />
                      </div>
                      <span className="text-tool-accent">
                        {shiftCount} shift{shiftCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="date"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const newPto = Array.from(
                            new Set([...m.pto, e.target.value])
                          );
                          updateMember(i, { pto: newPto });
                          e.target.value = "";
                        }}
                        className={`${inputCls} h-7 w-auto px-1.5 py-0 text-xs`}
                      />
                      <div className="flex flex-wrap gap-1">
                        {m.pto.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/[0.08] px-2 py-0.5 text-[0.65rem] text-amber-200"
                          >
                            {d}
                            <button
                              onClick={() =>
                                updateMember(i, {
                                  pto: m.pto.filter((x) => x !== d),
                                })
                              }
                              className="text-amber-300/70 hover:text-rose-300"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
              {members.length === 0 && (
                <li className="rounded-lg border border-dashed border-app bg-app-elevated px-3 py-6 text-center text-xs text-muted">
                  No members yet.
                </li>
              )}
            </ul>
          </Section>

          <Section label="rotation.setup" meta="cadence & start">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Rotation
                </span>
                <select
                  value={state.rotation}
                  onChange={(e) =>
                    setState({
                      ...state,
                      rotation: e.target.value as Rotation,
                    })
                  }
                  className={`${inputCls} mt-1`}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Start date
                </span>
                <input
                  type="date"
                  value={state.startDate}
                  onChange={(e) =>
                    setState({ ...state, startDate: e.target.value })
                  }
                  className={`${inputCls} mt-1`}
                />
              </label>
              <label className="block">
                <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Handoff time (24h)
                </span>
                <input
                  type="time"
                  value={state.handoffTime}
                  onChange={(e) =>
                    setState({ ...state, handoffTime: e.target.value })
                  }
                  className={`${inputCls} mt-1`}
                />
              </label>
              <label className="block">
                <span className="block text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Number of weeks
                </span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={state.weeks}
                  onChange={(e) =>
                    setState({
                      ...state,
                      weeks: Number(e.target.value) || 1,
                    })
                  }
                  className={`${inputCls} mt-1`}
                />
              </label>
            </div>
          </Section>

          <Section label="holidays" meta="premium dates">
            <div className="flex gap-2">
              <input
                type="date"
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                className={inputCls}
              />
              <button onClick={addHoliday} className={btnPrimary}>
                + Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(state.holidays || []).map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/[0.08] px-2 py-0.5 text-xs text-rose-200"
                >
                  {d}
                  <button
                    onClick={() => removeHoliday(d)}
                    className="text-rose-300/70 hover:text-rose-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              {(state.holidays || []).length === 0 && (
                <span className="text-xs text-muted">
                  No holidays flagged.
                </span>
              )}
            </div>
            {holidayLoad.length > 0 && (
              <div className="mt-4">
                <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Holiday-shift load
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {holidayLoad.map(([who, n]) => (
                    <span
                      key={who}
                      className="rounded-full border border-amber-400/25 bg-amber-500/[0.06] px-2 py-0.5 text-xs text-amber-200"
                    >
                      {who}: {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </aside>

        <div className="space-y-5">
          <Section label="calendar" meta="rotation map">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-app bg-app-elevated p-0.5 text-[0.6rem] uppercase tracking-[0.18em]">
                {(["week", "month", "list"] as CalendarView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-[5px] px-3 py-1.5 transition-colors ${
                      view === v
                        ? "bg-tool-accent text-app-elevated shadow-sm"
                        : "text-muted hover:text-secondary"
                    }`}
                    style={
                      view === v
                        ? {
                            color: "var(--bg)",
                            background: "var(--tool-accent)",
                          }
                        : undefined
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-6 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--tool-accent) 0%, var(--tool-accent-soft) 100%)",
                    }}
                  />
                  Primary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-6 rounded-full"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, var(--tool-accent-soft) 0 6px, transparent 6px 10px)",
                    }}
                  />
                  Secondary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                  Holiday
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-300/70" />
                  Swapped
                </span>
              </div>
            </div>

            {calendar.days.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app-elevated px-3 py-10 text-center text-sm text-muted">
                Add members to generate a schedule.
              </div>
            ) : view === "list" ? (
              <CalendarListView days={calendar.days} shifts={shifts} />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-7 gap-1 pb-1.5">
                    {dowLabels.map((d) => (
                      <div
                        key={d}
                        className="text-center text-[0.55rem] uppercase tracking-[0.22em] text-muted"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    {Array.from({ length: visibleWeekRows }).map((_, wIdx) => {
                      const rowCells = Array.from({ length: 7 }).map(
                        (_, dIdx) => {
                          const cellIdx = wIdx * 7 + dIdx;
                          const dayIdx = cellIdx - calendar.firstDow;
                          if (dayIdx < 0 || dayIdx >= calendar.days.length)
                            return null;
                          return calendar.days[dayIdx];
                        }
                      );

                      const primaries = rowCells
                        .filter((c) => c)
                        .map((c) => c!.primary);
                      const uniformPrimary =
                        primaries.length > 0 &&
                        primaries.every((p) => p === primaries[0]);

                      return (
                        <div key={wIdx} className="space-y-1">
                          {uniformPrimary && primaries[0] && (
                            <div className="flex items-center gap-2">
                              <div
                                className="h-1.5 flex-1 rounded-full"
                                style={{
                                  background: `linear-gradient(90deg, ${avatarFor(primaries[0]).bg} 0%, ${avatarFor(primaries[0]).bg}55 100%)`,
                                }}
                              />
                              <span
                                className="text-[0.55rem] uppercase tracking-[0.22em]"
                                style={{
                                  color: avatarFor(primaries[0]).bg,
                                }}
                              >
                                {primaries[0]} · primary
                              </span>
                            </div>
                          )}

                          {uniformPrimary && primaries[0] && (
                            <div
                              className="h-0.5 rounded-full opacity-60"
                              style={{
                                background:
                                  "repeating-linear-gradient(90deg, var(--tool-accent-soft) 0 8px, transparent 8px 14px)",
                              }}
                            />
                          )}

                          <div className="grid grid-cols-7 gap-1">
                            {rowCells.map((cell, dIdx) => {
                              if (!cell)
                                return (
                                  <div
                                    key={dIdx}
                                    className="h-[88px] rounded-md border border-app bg-app-elevated opacity-40"
                                  />
                                );
                              const av = avatarFor(cell.primary);
                              const sav = avatarFor(cell.secondary);
                              const shift = shifts[cell.shiftIdx];
                              const isSwapped = !!shift?.swapped;
                              return (
                                <div
                                  key={dIdx}
                                  className={`relative h-[88px] overflow-hidden rounded-md border p-1.5 transition-colors hover:border-tool-accent/40 ${
                                    cell.onHoliday
                                      ? "border-rose-400/30 bg-rose-500/[0.06]"
                                      : "border-app bg-app-elevated"
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <span className="text-[0.6rem] tabular-nums text-secondary">
                                      {cell.date.getDate()}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      {cell.onHoliday && (
                                        <span
                                          title="Holiday"
                                          className="h-1.5 w-1.5 rounded-full bg-rose-400/80"
                                        />
                                      )}
                                      {isSwapped && (
                                        <span
                                          title="Swapped"
                                          className="h-1.5 w-1.5 rounded-full bg-amber-300/80"
                                        />
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-1 flex items-center gap-1.5">
                                    <div
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold"
                                      style={{
                                        background: av.bg,
                                        color: av.ink,
                                      }}
                                    >
                                      {initials(cell.primary)}
                                    </div>
                                    <div className="min-w-0 truncate text-[0.7rem] font-medium text-app">
                                      {cell.primary}
                                    </div>
                                  </div>

                                  <div className="mt-1.5 flex items-center gap-1 text-[0.55rem] text-muted">
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm text-center text-[0.5rem] font-bold leading-3"
                                      style={{
                                        background: sav.bg,
                                        color: sav.ink,
                                      }}
                                    >
                                      {initials(cell.secondary).slice(0, 1)}
                                    </span>
                                    <span className="truncate">
                                      2nd · {cell.secondary}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section label="shift.list" meta="inline swap">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="py-2 pr-3 text-left">#</th>
                    <th className="py-2 pr-3 text-left">Primary</th>
                    <th className="py-2 pr-3 text-left">Swap</th>
                    <th className="py-2 pr-3 text-left">Start</th>
                    <th className="py-2 pr-3 text-left">End</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s, i) => {
                    const av = avatarFor(s.who);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-app transition-colors hover:bg-tool-accent-soft ${
                          s.onHoliday ? "bg-rose-500/[0.04]" : ""
                        }`}
                      >
                        <td className="py-2 pr-3 text-xs tabular-nums text-muted">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[0.6rem] font-bold"
                              style={{ background: av.bg, color: av.ink }}
                            >
                              {initials(s.who)}
                            </div>
                            <span className="text-app">{s.who}</span>
                            {s.onHoliday && (
                              <span className="rounded border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-rose-200">
                                Hol
                              </span>
                            )}
                            {s.swapped && (
                              <span className="rounded border border-amber-400/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-amber-200">
                                Swap
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <select
                            value={
                              (state.swaps || []).find(
                                (sw) => sw.shiftIdx === i
                              )?.newMember || ""
                            }
                            onChange={(e) => applySwap(i, e.target.value)}
                            className={`${inputCls} h-8 w-28 px-2 py-1 text-xs`}
                          >
                            <option value="">—</option>
                            {members.map((m) => (
                              <option key={m.name} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-xs tabular-nums text-secondary">
                          {fmtDayShort(s.start)} {fmtTimeShort(s.start)}
                        </td>
                        <td className="py-2 pr-3 text-xs tabular-nums text-secondary">
                          {fmtDayShort(s.end)} {fmtTimeShort(s.end)}
                        </td>
                      </tr>
                    );
                  })}
                  {shifts.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted"
                      >
                        Add members to generate a schedule.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {coverage.length > 0 && (
              <div className="mt-4 rounded-lg border border-app bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Shift count · fairness stdev {fairness.stdev.toFixed(2)}
                </div>
                <div className="mt-2 space-y-1.5">
                  {coverage.map(([who, n]) => {
                    const max = coverage[0][1] || 1;
                    const pct = (n / max) * 100;
                    const av = avatarFor(who);
                    return (
                      <div key={who} className="flex items-center gap-2">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[0.55rem] font-bold"
                          style={{ background: av.bg, color: av.ink }}
                        >
                          {initials(who)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-[0.7rem]">
                            <span className="truncate text-secondary">
                              {who}
                            </span>
                            <span className="tabular-nums text-muted">
                              {n} shift{n === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-app">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: av.bg,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Meeting Cost pane
═══════════════════════════════════════════════════════════════════════════ */

interface Attendee {
  id: string;
  role: string;
  rate: string;
}

const mcUid = () => Math.random().toString(36).slice(2, 9);

const ROLE_RATE_PRESETS: { role: string; rate: number; note: string }[] = [
  { role: "Junior Engineer", rate: 80, note: "Entry-level SWE" },
  { role: "Engineer", rate: 120, note: "Mid-level SWE / IC3" },
  { role: "Senior Engineer", rate: 160, note: "Senior / IC4" },
  { role: "Staff Engineer", rate: 220, note: "Staff+ / IC5" },
  { role: "Engineering Manager", rate: 180, note: "Line manager" },
  { role: "Product Manager", rate: 140, note: "Mid-level PM" },
  { role: "Senior PM", rate: 180, note: "Senior PM / Group PM" },
  { role: "Designer", rate: 110, note: "Product designer" },
  { role: "Senior Designer", rate: 150, note: "Senior / staff designer" },
  { role: "Data Analyst", rate: 95, note: "Mid-level" },
  { role: "Data Scientist", rate: 140, note: "Mid / senior DS" },
  { role: "Sales AE", rate: 130, note: "Fully-loaded incl. OTE" },
  { role: "Customer Success", rate: 90, note: "CSM" },
  { role: "Marketing Manager", rate: 110, note: "Mid-level marketer" },
  { role: "Director", rate: 220, note: "Director-level leader" },
  { role: "VP", rate: 280, note: "VP" },
  { role: "Executive (C-level)", rate: 300, note: "CxO fully-loaded" },
];

type BreakdownTab = "ledger" | "share" | "recurrence";

function MeetingCostTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

function MeetingCostPane() {
  const [attendees, setAttendees] = useState<Attendee[]>([
    { id: mcUid(), role: "Senior Manager", rate: "120" },
    { id: mcUid(), role: "Engineer", rate: "85" },
    { id: mcUid(), role: "Engineer", rate: "85" },
    { id: mcUid(), role: "Designer", rate: "75" },
  ]);
  const [durationMin, setDurationMin] = useState("60");
  const [frequencyPerYear, setFrequencyPerYear] = useState("52");
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>("ledger");

  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startRef.current != null) {
        setElapsedMs(Date.now() - startRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const { totalRate, cost, annualCost } = useMemo(() => {
    const total = attendees.reduce(
      (sum, a) => sum + (parseFloat(a.rate) || 0),
      0
    );
    const hours = (parseFloat(durationMin) || 0) / 60;
    const single = total * hours;
    const annual = single * (parseFloat(frequencyPerYear) || 0);
    return { totalRate: total, cost: single, annualCost: annual };
  }, [attendees, durationMin, frequencyPerYear]);

  const liveCost = useMemo(() => {
    return totalRate * (elapsedMs / 3_600_000);
  }, [totalRate, elapsedMs]);

  const ratePerMinute = totalRate / 60;
  const AMBER_THRESHOLD = 250;
  const ROSE_THRESHOLD = 1000;
  const heatLevel: "calm" | "amber" | "rose" =
    liveCost >= ROSE_THRESHOLD
      ? "rose"
      : liveCost >= AMBER_THRESHOLD
        ? "amber"
        : "calm";

  const addAttendee = () =>
    setAttendees((prev) => [...prev, { id: mcUid(), role: "", rate: "" }]);
  const addFromPreset = (role: string, rate: number) =>
    setAttendees((prev) => [
      ...prev,
      { id: mcUid(), role, rate: String(rate) },
    ]);
  const removeAttendee = (id: string) =>
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  const update = (id: string, patch: Partial<Attendee>) =>
    setAttendees((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const fmtPrecise = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtClock = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const handleStart = () => {
    if (running) return;
    startRef.current = Date.now() - elapsedMs;
    setRunning(true);
  };
  const handlePause = () => {
    setRunning(false);
  };
  const handleReset = () => {
    setRunning(false);
    startRef.current = null;
    setElapsedMs(0);
  };

  const heatNumberClass =
    heatLevel === "rose"
      ? "text-rose-500"
      : heatLevel === "amber"
        ? "text-amber-500"
        : "text-tool-accent";

  const heatChipClass =
    heatLevel === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
      : heatLevel === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : "border-tool-accent/30 bg-tool-accent-soft text-tool-accent";

  const heatLabelTone =
    heatLevel === "rose"
      ? "This meeting could have been a Slack."
      : heatLevel === "amber"
        ? "This meeting could have been an email."
        : "Every minute counts.";

  const heatBorderClass =
    heatLevel === "rose"
      ? "border-rose-500/30"
      : heatLevel === "amber"
        ? "border-amber-500/30"
        : "border-tool-accent/25";

  const numAttendees = attendees.length;

  return (
    <div
      data-tool-theme="finance"
      data-tool="meeting-cost-calculator"
      className="space-y-5 text-app"
    >
      {/* Live ticker hero */}
      <section
        className={`relative overflow-hidden rounded-2xl border bg-app-elevated px-6 py-7 ${heatBorderClass}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "100% 2.25rem",
          }}
        />

        <div className="relative flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  running ? "animate-pulse bg-rose-500" : "bg-muted/60"
                }`}
              />
              {running ? "Recording" : elapsedMs > 0 ? "Paused" : "Ready"}
            </div>
            <div className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
              {numAttendees} {numAttendees === 1 ? "attendee" : "attendees"} ·{" "}
              {fmt(totalRate)}/hr · USD
            </div>
          </div>

          <div className="text-center">
            <div className="mb-2 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
              Money on fire
            </div>
            <div
              className={`font-mono font-bold leading-none tracking-tight tabular-nums transition-colors duration-500 ${heatNumberClass}`}
              style={{ fontSize: "clamp(2.5rem, 11vw, 6rem)" }}
            >
              {elapsedMs === 0 && !running ? fmt(0) : fmtPrecise(liveCost)}
            </div>
            <div className="mt-3 text-sm text-secondary">{heatLabelTone}</div>
          </div>

          <div className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
            <div className="bg-app-elevated p-3 text-center">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Elapsed
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmtClock(elapsedMs)}
              </div>
            </div>
            <div className="bg-app-elevated p-3 text-center">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Rate / min
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmtPrecise(ratePerMinute)}
              </div>
            </div>
            <div className="bg-app-elevated p-3 text-center">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Scheduled
              </div>
              <div className="mt-1 tabular-nums text-app">{fmt(cost)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2 rounded-md border border-tool-accent/50 bg-tool-accent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                {elapsedMs > 0 ? "Resume" : "Start meeting"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-2 rounded-md border border-tool-accent/50 bg-tool-accent-soft px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-tool-accent transition-all hover:bg-tool-accent/20 active:scale-[0.98]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={elapsedMs === 0 && !running}
              className="inline-flex items-center gap-2 rounded-md border border-app bg-app-elevated px-4 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-secondary transition-all hover:border-tool-accent/30 hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
              Reset
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] ${heatChipClass}`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              Burn:{" "}
              {heatLevel === "rose"
                ? "Critical"
                : heatLevel === "amber"
                  ? "Elevated"
                  : "Calm"}
            </span>
          </div>
        </div>
      </section>

      {/* Roster + bill */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Attendee roster
            </h2>
            <div className="flex items-center gap-3 font-mono text-[0.65rem] tabular-nums">
              <span className="text-muted">Combined</span>
              <span className="text-tool-accent">{fmt(totalRate)}/hr</span>
            </div>
          </div>

          <div className="grid grid-cols-[1.75rem_1fr_6rem_5rem_2rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-center">#</span>
            <span>Role / name</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Hourly</span>
            <span />
          </div>

          <ul className="mt-2 space-y-1.5">
            {attendees.map((a, i) => {
              const rateNum = parseFloat(a.rate) || 0;
              const share =
                totalRate > 0 ? (rateNum / totalRate) * 100 : 0;
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[1.75rem_1fr_6rem_5rem_2rem] items-center gap-2"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app font-mono text-[0.65rem] tabular-nums text-muted">
                    {i + 1}
                  </div>
                  <input
                    type="text"
                    value={a.role}
                    onChange={(e) => update(a.id, { role: e.target.value })}
                    placeholder="Role / name"
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-app outline-none transition-colors placeholder:text-muted hover:border-app focus:border-tool-accent focus:bg-app"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                      $
                    </span>
                    <input
                      type="number"
                      value={a.rate}
                      onChange={(e) => update(a.id, { rate: e.target.value })}
                      placeholder="85"
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                      min="0"
                      step="5"
                    />
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums text-secondary">
                    {share.toFixed(0)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttendee(a.id)}
                    className="rounded-md border border-transparent text-sm text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                    aria-label={`Remove ${a.role || "attendee"}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addAttendee}
              className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
            >
              + Add attendee
            </button>
            <select
              defaultValue=""
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const [role, rateStr] = e.target.value.split("|");
                if (role) addFromPreset(role, Number(rateStr));
                e.target.value = "";
              }}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-secondary transition-colors hover:border-tool-accent/30 hover:text-tool-accent"
            >
              <option value="">From preset…</option>
              {ROLE_RATE_PRESETS.map((p) => (
                <option key={p.role} value={`${p.role}|${p.rate}`}>
                  {p.role} — ${p.rate}/hr
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-app pt-5">
            <label className="block">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                Scheduled duration (min)
              </span>
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="mt-1 w-full rounded-md border border-app bg-app px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                min="1"
                step="15"
              />
            </label>
            <label className="block">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                Times per year
              </span>
              <input
                type="number"
                value={frequencyPerYear}
                onChange={(e) => setFrequencyPerYear(e.target.value)}
                className="mt-1 w-full rounded-md border border-app bg-app px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                min="0"
                step="1"
              />
            </label>
          </div>
        </div>

        <aside className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-app">
              The bill
            </h2>
            <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Per scheduled run
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-tool-accent/25 bg-tool-accent-soft p-4">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent/80">
                This meeting
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                {fmt(cost)}
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Combined / hr
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(totalRate)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Per minute
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmtPrecise(ratePerMinute)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Annual (recurring)
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(annualCost)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Headcount-hrs / yr
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {(
                    ((parseFloat(durationMin) || 0) / 60) *
                    (parseFloat(frequencyPerYear) || 0) *
                    numAttendees
                  ).toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {/* Breakdown tabs */}
      <section className="rounded-2xl border border-app bg-app-elevated p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Breakdown
            </h2>
            <p className="mt-0.5 text-[0.7rem] text-muted">
              Per-attendee burn, share of bill, and recurrence projections.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MeetingCostTabButton
              active={breakdownTab === "ledger"}
              onClick={() => setBreakdownTab("ledger")}
            >
              Ledger
            </MeetingCostTabButton>
            <MeetingCostTabButton
              active={breakdownTab === "share"}
              onClick={() => setBreakdownTab("share")}
            >
              Share bars
            </MeetingCostTabButton>
            <MeetingCostTabButton
              active={breakdownTab === "recurrence"}
              onClick={() => setBreakdownTab("recurrence")}
            >
              Recurrence
            </MeetingCostTabButton>
          </div>
        </header>

        {breakdownTab === "ledger" && (
          <div className="overflow-hidden rounded-md border border-app">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="bg-app-elevated text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-right">Rate / hr</th>
                  <th className="px-3 py-2 text-right">This meeting</th>
                  <th className="px-3 py-2 text-right">Annual</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {attendees.map((a, i) => {
                  const rateNum = parseFloat(a.rate) || 0;
                  const hours = (parseFloat(durationMin) || 0) / 60;
                  const single = rateNum * hours;
                  const annual =
                    single * (parseFloat(frequencyPerYear) || 0);
                  return (
                    <tr key={a.id} className="border-t border-app text-app">
                      <td className="px-3 py-1.5 text-secondary">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-1.5">{a.role || "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        {fmt(rateNum)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-tool-accent">
                        {fmt(single)}
                      </td>
                      <td className="px-3 py-1.5 text-right">{fmt(annual)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-app bg-app font-semibold">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(totalRate)}</td>
                  <td className="px-3 py-2 text-right text-tool-accent">
                    {fmt(cost)}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(annualCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {breakdownTab === "share" && (
          <div className="space-y-1 font-mono text-[0.7rem]">
            <div className="mb-2 flex items-center justify-end gap-3 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-tool-accent/70" /> Share
                of cost
              </span>
            </div>
            {attendees.map((a, i) => {
              const rateNum = parseFloat(a.rate) || 0;
              const share =
                totalRate > 0 ? (rateNum / totalRate) * 100 : 0;
              const single = rateNum * ((parseFloat(durationMin) || 0) / 60);
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-sm px-1 py-0.5 text-secondary"
                >
                  <span className="w-6 tabular-nums text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-40 truncate text-app">
                    {a.role || "—"}
                  </span>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-app">
                    <div
                      className="absolute left-0 top-0 h-full rounded-sm bg-tool-accent/70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-secondary">
                    {share.toFixed(0)}%
                  </span>
                  <span className="w-20 text-right tabular-nums text-tool-accent">
                    {fmt(single)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {breakdownTab === "recurrence" && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-app bg-app font-mono text-sm md:grid-cols-4">
            {[
              { label: "Weekly · 52/yr", value: cost * 52, accent: false },
              {
                label: "Bi-weekly · 26/yr",
                value: cost * 26,
                accent: false,
              },
              { label: "Monthly · 12/yr", value: cost * 12, accent: false },
              { label: "Your cadence", value: annualCost, accent: true },
            ].map((c) => (
              <div
                key={c.label}
                className={`p-3 ${c.accent ? "bg-tool-accent-soft" : "bg-app-elevated"}`}
              >
                <div
                  className={`text-[0.55rem] uppercase tracking-[0.2em] ${
                    c.accent ? "text-tool-accent/80" : "text-muted"
                  }`}
                >
                  {c.label}
                </div>
                <div
                  className={`mt-1 tabular-nums ${
                    c.accent
                      ? "font-semibold text-tool-accent"
                      : "text-app"
                  }`}
                >
                  {fmt(c.value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar + main shell
═══════════════════════════════════════════════════════════════════════════ */

type Pane = "world-clock" | "planner" | "oncall" | "cost";

const PANES: {
  k: Pane;
  name: string;
  icon: string;
  hint: string;
}[] = [
  { k: "world-clock", name: "World Clock", icon: "◑", hint: "multi-city" },
  { k: "planner", name: "Timezone Planner", icon: "⇆", hint: "overlap finder" },
  { k: "oncall", name: "On-call Schedule", icon: "↻", hint: "rotation · ICS" },
  { k: "cost", name: "Meeting Cost", icon: "$", hint: "ticker · breakdown" },
];

export default function TeamScheduleApp(_props: NativeAppProps) {
  const [active, setActive] = useState<Pane>("world-clock");
  const narrow = (_props.width ?? 0) < 640;

  return (
    <div
      data-tool-theme="productivity"
      data-tool="team-schedule"
      className="flex h-full w-full overflow-hidden bg-app text-app"
      style={{
        height: _props.height ?? "100%",
      }}
    >
      <aside
        className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-app bg-app-elevated p-2"
        style={{ width: narrow ? 96 : 220 }}
      >
        <div className="mb-1 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          {narrow ? "team" : "team schedule"}
        </div>
        {PANES.map((c) => {
          const isActive = active === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setActive(c.k)}
              className={`group flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent bg-transparent text-secondary hover:border-app hover:bg-app hover:text-app"
              }`}
              title={c.name}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[0.6rem] font-semibold ${
                  isActive
                    ? "border-tool-accent bg-tool-accent text-app-elevated"
                    : "border-app bg-app text-secondary group-hover:border-tool-accent group-hover:text-tool-accent"
                }`}
                style={isActive ? { color: "var(--bg)" } : undefined}
              >
                {c.icon}
              </span>
              {!narrow && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{c.name}</div>
                  <div className="truncate font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                    {c.hint}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </aside>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[1100px]">
          {active === "world-clock" && <WorldClockPane />}
          {active === "planner" && <TimezonePlannerPane />}
          {active === "oncall" && <OncallSchedulePane />}
          {active === "cost" && <MeetingCostPane />}
        </div>
      </main>
    </div>
  );
}
