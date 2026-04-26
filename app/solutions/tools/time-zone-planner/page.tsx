"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

// Curated list of common business time zones with IANA names.
// We use Intl.DateTimeFormat to compute offsets at render time so DST is handled.
const ZONES = [
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

// Offset in minutes from UTC for a zone at `date`.
function tzOffsetMinutes(tz: string, date = new Date()): number {
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
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function fmtOffset(mins: number) {
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, "0")}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

export default function TimeZonePlannerPage() {
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
        label: ZONES.find((z) => z.tz === tz)?.label ?? tz,
        offsetMin: offset,
      };
    });
  }, [selected, now]);

  const startH = Math.max(0, Math.min(23, parseInt(workStart) || 0));
  const endH = Math.max(startH + 1, Math.min(24, parseInt(workEnd) || 0));

  // For each UTC hour 0..23, evaluate whether all zones are within work hours.
  // Then find the best contiguous overlap window.
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
    // Search wrapping around midnight UTC
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

  // ───────────────────────────────────────────────────────────────────
  // Visual-only state: meeting-time picker (UTC hour, 0..23, fractional)
  // Initialised to the start of the best overlap window when one exists.
  // ───────────────────────────────────────────────────────────────────
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
    const hour = Math.round(frac * 24 * 4) / 4; // quarter-hour snap, visual-only
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

  // Day/night gradient for a city based on its current local hour.
  const cityGradient = (localHour: number) => {
    const h = ((localHour % 24) + 24) % 24;
    if (h < 5) {
      // deep night
      return "linear-gradient(160deg, #0b1437 0%, #1a1147 60%, #2a1659 100%)";
    }
    if (h < 7) {
      // dawn
      return "linear-gradient(160deg, #2a1f4a 0%, #5b3262 50%, #d97455 100%)";
    }
    if (h < 11) {
      // morning
      return "linear-gradient(160deg, #f6c177 0%, #f0a060 50%, #5fb6e0 100%)";
    }
    if (h < 16) {
      // midday
      return "linear-gradient(160deg, #87cefa 0%, #4ea7d8 50%, #2563a8 100%)";
    }
    if (h < 19) {
      // late afternoon
      return "linear-gradient(160deg, #ffb37a 0%, #f07a4d 50%, #6e2c6b 100%)";
    }
    if (h < 21) {
      // dusk
      return "linear-gradient(160deg, #5b3262 0%, #2a1659 60%, #131046 100%)";
    }
    // night
    return "linear-gradient(160deg, #131046 0%, #0b1437 60%, #050823 100%)";
  };

  const isDaytime = (h: number) => {
    const x = ((h % 24) + 24) % 24;
    return x >= 6 && x < 19;
  };

  // Compute current local time for a zone (decimal hours).
  const localHourFor = (offsetMin: number) => {
    const utcMs = now.getTime();
    const local = new Date(utcMs + offsetMin * 60_000);
    return local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
  };

  // Analog clock SVG component for a single zone.
  const AnalogClock = ({ hourDecimal, day }: { hourDecimal: number; day: boolean }) => {
    const h = ((hourDecimal % 24) + 24) % 24;
    const min = (h % 1) * 60;
    const hourAng = ((h % 12) + min / 60) * 30; // deg
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
        {/* hour hand */}
        <line
          x1="50"
          y1="50"
          x2={50 + Math.sin((hourAng * Math.PI) / 180) * 24}
          y2={50 - Math.cos((hourAng * Math.PI) / 180) * 24}
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* minute hand */}
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

  // Meeting hour, formatted into each zone's local clock for the picker readout.
  const meetingLocalFor = (offsetMin: number) => {
    const local = ((meetingUtcHour + offsetMin / 60) % 24 + 24) % 24;
    return local;
  };

  return (
    <div data-tool-theme="productivity" data-tool="time-zone-planner">
      <style jsx>{`
        @keyframes tzp-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .tzp-tick { animation: tzp-pulse 2s ease-in-out infinite; }
      `}</style>

      <ToolShell
        category="Productivity"
        title="Time-zone Meeting Planner"
        description="Pick up to five cities, set working-hour bounds, and find the least painful overlap window."
      >
        {/* In-tool header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tool-accent-soft ring-1 ring-tool-accent/30">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tool-accent">
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
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tzp-tick" />
              {zoneData.length} {zoneData.length === 1 ? "city" : "cities"}
            </span>
            <span className="hidden rounded-full border border-app bg-app px-3 py-1 text-[0.7rem] text-secondary sm:inline-flex">
              Working {String(startH).padStart(2, "0")}:00 – {String(endH).padStart(2, "0")}:00
            </span>
          </div>
        </div>

        {/* HERO — multi-clock row */}
        <section className="relative overflow-hidden rounded-2xl border border-tool-accent/20 tool-hero p-4 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              color: "currentColor",
            }}
          />
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
                      {/* sun / moon corner */}
                      <div className="absolute right-2 top-2 opacity-80">
                        {day ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                          </svg>
                        )}
                      </div>

                      <div className="flex flex-col items-center gap-2 text-center">
                        <AnalogClock hourDecimal={lh} day={day} />
                        <div className="font-mono text-lg font-semibold tabular-nums text-white drop-shadow">
                          {String(intH).padStart(2, "0")}
                          <span className="opacity-70">:</span>
                          {String(intM).padStart(2, "0")}
                        </div>
                        <div className="text-xs font-medium text-white/95 drop-shadow">{z.label}</div>
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

        {/* OVERLAP BAND with draggable meeting picker */}
        {zoneData.length > 0 && (
          <section className="mt-5 rounded-2xl border border-app bg-app-elevated p-5 backdrop-blur-sm">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-app">24-hour overlap band</h2>
                <p className="text-xs text-secondary">
                  Tinted segments are inside everyone's working hours. Drag the marker to pick a meeting time.
                </p>
              </div>
              <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-tool-accent">
                Meeting · UTC {formatLocalHour(meetingUtcHour)}
              </div>
            </div>

            {/* hour ruler */}
            <div className="mb-1 grid grid-cols-24 text-[0.55rem] uppercase tracking-wide text-muted" style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="text-center">
                  {i % 3 === 0 ? String(i).padStart(2, "0") : "·"}
                </div>
              ))}
            </div>

            {/* the band */}
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
              {/* Per-zone shading layers */}
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

              {/* mid-line + hour ticks */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-app" />
              <div className="pointer-events-none absolute inset-0 flex">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="flex-1 border-r border-app last:border-r-0" />
                ))}
              </div>

              {/* "now" marker (current UTC hour) */}
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

              {/* meeting handle */}
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

            {/* per-row local time strips, aligned to band */}
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

            {/* Meeting-time readout (one row per zone) */}
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

        {/* CITY PICKER + WORK HOURS + BEST WINDOW + HEATMAP */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
          <ToolCard title="Your zones" subtitle="Pick up to 5">
            <div className="max-h-80 overflow-y-auto rounded-md border border-app bg-app p-2">
              <div className="grid grid-cols-1 gap-1">
                {ZONES.map((z) => {
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
              <Field label="Work start" hint="24h">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                  className={inputCls()}
                />
              </Field>
              <Field label="Work end" hint="24h">
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={workEnd}
                  onChange={(e) => setWorkEnd(e.target.value)}
                  className={inputCls()}
                />
              </Field>
            </div>
          </ToolCard>

          <ToolCard title="Best overlap window" subtitle="The longest contiguous slot where everyone is working">
            <div className="rounded-xl border border-tool-accent/25 bg-tool-accent-soft p-4">
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent/85">
                Best overlap (UTC)
              </div>
              {bestWindow ? (
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-tool-accent">
                  {String(bestWindow.start).padStart(2, "0")}:00 –{" "}
                  {String((bestWindow.start + bestWindow.len) % 24).padStart(2, "0")}:00
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

            {/* Weekly business-hours heatmap overlay */}
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
                        const frac = zoneData.length ? count / zoneData.length : 0;
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
                Darker = more zones in working hours. Weekends excluded; all zones observe DST through Intl.DateTimeFormat.
              </div>
            </div>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
