"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { inputCls } from "../../_components/ToolCard";

interface City {
  id: string;
  label: string;
  tz: string; // IANA
}

type HourFormat = "24h" | "12h";

const STORAGE_KEY = "solutions:world-clock:v1";
const FORMAT_LS_KEY = "solutions:world-clock:format:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

// Curated city list with IANA zones.
const CITIES: { label: string; tz: string }[] = [
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

const DEFAULT_CITIES: City[] = [
  { id: uid(), label: "Dubai", tz: "Asia/Dubai" },
  { id: uid(), label: "London", tz: "Europe/London" },
  { id: uid(), label: "New York", tz: "America/New_York" },
  { id: uid(), label: "Singapore", tz: "Asia/Singapore" },
];

const MAX_CITIES = 12;

export default function WorldClockPage() {
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES);
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hourFormat, setHourFormat] = useState<HourFormat>("24h");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as City[];
        if (Array.isArray(parsed)) setCities(parsed);
      }
      const f = localStorage.getItem(FORMAT_LS_KEY);
      if (f === "12h" || f === "24h") setHourFormat(f);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
      localStorage.setItem(FORMAT_LS_KEY, hourFormat);
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
    return CITIES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const addCity = (c: { label: string; tz: string }) => {
    if (cities.length >= MAX_CITIES) return;
    setCities((prev) => [...prev, { id: uid(), ...c }]);
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
    <div data-tool-theme="productivity" data-tool="world-clock">
      <ToolShell
        category="Productivity"
        title="World Clock"
        description="Track up to 12 cities. See local time, the offset from yours, and whether each person is in business hours, near them, or asleep."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              tz:{localTz.split("/").pop()?.toLowerCase() || "local"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {cities.length}/{MAX_CITIES} cities
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
                    {MAX_CITIES - cities.length} slots free
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {heroCities.length > 0
                    ? heroCities.map((c) => c.label).join(" · ")
                    : "Add a city to start"}
                </h2>
              </div>

              {/* business-hours dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${cities.length > 0 ? (inBusiness / cities.length) * 100 : 0}, 100`}
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

          {/* sub-tab strip — search + format toggle */}
          <div className="flex flex-wrap items-center gap-2 border-t border-app bg-app px-4 py-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Add a city or timezone…"
                disabled={cities.length >= MAX_CITIES}
                className={inputCls("pl-8 pr-3 disabled:opacity-50")}
              />
              {filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-app bg-app-elevated p-1 shadow-xl">
                  {filtered.map((c) => (
                    <button
                      type="button"
                      key={`${c.label}-${c.tz}`}
                      onClick={() => addCity(c)}
                      disabled={cities.length >= MAX_CITIES}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-secondary transition-colors hover:bg-tool-accent-soft hover:text-tool-accent disabled:opacity-40"
                    >
                      <span>{c.label}</span>
                      <span className="font-mono text-[0.6rem] text-faint">{c.tz}</span>
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

            {/* 12h / 24h segmented pills */}
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

        {/* ============================== HERO DIAL BOARD ============================== */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {heroCities.map((c) => {
            const parts = getZoneParts(c.tz, now);
            const status = businessStatus(parts.hour24, parts.weekday);
            const offset = formatOffsetDelta(c.tz, localTz, now);
            const period = dayPeriod(parts.hour24);
            const display = formatTime(parts.hour24, parts.minute24, parts.second24, hourFormat);
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
          {/* Fill empty hero slots so the grid stays balanced */}
          {Array.from({ length: Math.max(0, 4 - heroCities.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="hidden rounded-xl border border-dashed border-app bg-app-elevated px-3 py-10 text-center font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint sm:block"
            >
              Empty slot
            </div>
          ))}
        </section>

        {/* ============================== SECONDARY DIGITAL TILES ============================== */}
        {tileCities.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▾ secondary cities · digital
              </div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                {tileCities.length} / {MAX_CITIES - 4}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {tileCities.map((c) => {
                const parts = getZoneParts(c.tz, now);
                const status = businessStatus(parts.hour24, parts.weekday);
                const offset = formatOffsetDelta(c.tz, localTz, now);
                const display = formatTime(parts.hour24, parts.minute24, 0, hourFormat);
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
                      <span className="text-tool-accent">{offset === "same as you" ? "local" : offset}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {cities.length === 0 && (
          <ToolCard>
            <div className="py-8 text-center text-sm text-muted">
              Add a city to start.
            </div>
          </ToolCard>
        )}

        {/* ============================== LEGEND ============================== */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
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

        {/* ============================== MEETING FINDER ============================== */}
        {cities.length >= 2 && (
          <ToolCard title="Meeting finder" subtitle="Best overlap across these cities">
            {(() => {
              // Build 24-hour UTC grid and find contiguous windows where
              // every city is within 9–17 local.
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
              let best: { start: number; len: number; tier: "work" | "edge" } | null = null;
              // Find best work window first, then fall back to "edge" (extended)
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
                    No shared 9-to-17 overlap even with a 7–19 extended window. Some of these cities are truly antipodal — you&apos;ll need to split into two meetings or accept an off-hours slot.
                  </div>
                );
              }
              const endUtc = (best.start + best.len) % 24;
              return (
                <>
                  <div className="text-sm text-app">
                    Best{" "}
                    <span className={best.tier === "work" ? "text-emerald-500" : "text-amber-500"}>
                      {best.tier === "work" ? "business-hours" : "extended-hours"}
                    </span>{" "}
                    overlap:{" "}
                    <span className="font-mono text-tool-accent">
                      UTC {String(best.start).padStart(2, "0")}:00–{String(endUtc).padStart(2, "0")}:00
                    </span>{" "}
                    ({best.len}h)
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                    {rows.map(({ city, offset }) => {
                      const localStart = (((best!.start + offset / 60) % 24) + 24) % 24;
                      const localEnd = (((best!.start + best!.len + offset / 60) % 24) + 24) % 24;
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
          </ToolCard>
        )}
      </ToolShell>
    </div>
  );
}

// ── Analog dial ─────────────────────────────────────────────────────────────
// Pure SVG, sized for the hero. Hour/minute/second hands rotate based on the
// supplied local-time numbers (which already come from the IANA-aware getter).
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
  // Smooth hand positions — minute follows second fraction, hour follows minute fraction.
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
        <radialGradient id={`face-${period.faceFrom}-${period.faceTo}`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor={period.faceFrom} />
          <stop offset="100%" stopColor={period.faceTo} />
        </radialGradient>
      </defs>

      {/* Outer ring */}
      <circle cx={c} cy={c} r={c - 2} fill={`url(#face-${period.faceFrom}-${period.faceTo})`} stroke={period.stroke} strokeWidth="1.5" />

      {/* Hour ticks */}
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

      {/* Hour hand */}
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
      {/* Minute hand */}
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
      {/* Second hand */}
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
      {/* Pivot */}
      <circle cx={c} cy={c} r="3" className="fill-tool-accent" />
      <circle cx={c} cy={c} r="1.2" className="fill-app" />
    </svg>
  );
}

// Map local hour → background gradient + dial face palette.
function dayPeriod(hour24: number): {
  label: string;
  bg: string;
  stroke: string;
  faceFrom: string;
  faceTo: string;
} {
  // Dawn (5–8) → Day (8–17) → Dusk (17–20) → Night (20–5)
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
    const find = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const hour = find("hour");
    const minute = find("minute");
    const second = find("second");
    const wd = find("weekday");
    const day = find("day");
    const mo = find("month");

    // weekday number
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

// 12h/24h formatter — returns time string + optional AM/PM suffix chip
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

function businessStatus(hour: number, weekday: number): "work" | "edge" | "off" {
  const weekend = weekday === 0 || weekday === 6;
  if (weekend) return "off";
  if (hour >= 9 && hour < 17) return "work";
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return "edge";
  return "off";
}

function tzOffsetMinutes(tz: string, ts: number): number {
  try {
    const d = new Date(ts);
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(d);
    const map: Record<string, string> = {};
    parts.forEach((p) => (map[p.type] = p.value));
    const asUtc = Date.UTC(
      parseInt(map.year),
      parseInt(map.month) - 1,
      parseInt(map.day),
      parseInt(map.hour),
      parseInt(map.minute),
      parseInt(map.second)
    );
    return Math.round((asUtc - ts) / 60000);
  } catch {
    return 0;
  }
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
