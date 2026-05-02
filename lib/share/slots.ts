/* Available-slot computation for booking pages.
 *
 * Pure functions — no Supabase calls, no Date.now ambient state. The
 * caller passes (a) the booking config, (b) the target date, (c) any
 * already-booked slot start times. We return the open slots.
 *
 * Timezones are kept simple: the booking page declares its timezone in
 * BookingPayload.timezone, all slot times are computed in that timezone.
 * The viewer renders slots with the recipient's local time alongside.
 */

import type { BookingPayload } from "./types";

export interface SlotSpec {
  /** ISO-like local timestamp in the booking's timezone (no tz suffix). */
  startLocal: string;
  /** Minute-of-day (0-1439) for the slot start in booking timezone. */
  startMinute: number;
  /** Date string YYYY-MM-DD in booking timezone. */
  date: string;
  /** Day of week 0=Sun..6=Sat. */
  dayOfWeek: number;
}

const MINUTES_IN_DAY = 24 * 60;

export function generateSlotsForDate(
  config: Pick<BookingPayload, "windows" | "durationMinutes" | "buffer">,
  dateStr: string,
  bookedStarts: Set<string>
): SlotSpec[] {
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return [];
  const dow = date.getDay(); // 0..6
  const stride = Math.max(15, config.durationMinutes + (config.buffer ?? 0));
  const out: SlotSpec[] = [];

  for (const w of config.windows) {
    if (w.dayOfWeek !== dow) continue;
    let cursor = w.startMinute;
    while (cursor + config.durationMinutes <= w.endMinute) {
      const startLocal = `${dateStr}T${formatTime(cursor)}`;
      if (!bookedStarts.has(startLocal)) {
        out.push({
          startLocal,
          startMinute: cursor,
          date: dateStr,
          dayOfWeek: dow,
        });
      }
      cursor += stride;
    }
  }

  return out.sort((a, b) => a.startMinute - b.startMinute);
}

export function formatTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function formatTimeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* List the next N days that have at least one window, regardless of bookings. */
export function listAvailableDates(
  config: Pick<BookingPayload, "windows">,
  startDate: Date,
  horizonDays: number
): string[] {
  const dows = new Set(config.windows.map((w) => w.dayOfWeek));
  const out: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    if (dows.has(d.getDay())) {
      out.push(toDateStr(d));
    }
  }
  return out;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
