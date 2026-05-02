"use client";

/* BookingPicker — date list + slot grid + invitee form. Mirrors the
 * Calendly/Cal.com pattern: pick day → pick time → enter details → confirm.
 */

import { useMemo, useState } from "react";
import type { BookingPayload } from "@/lib/toshare/types";
import {
  generateSlotsForDate,
  formatTimeLabel,
  listAvailableDates,
  toDateStr,
} from "@/lib/toshare/slots";

interface Props {
  linkId: string;
  payload: BookingPayload;
  bookedSlots: string[];
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookingPicker({ linkId, payload, bookedSlots }: Props) {
  const today = useMemo(() => new Date(), []);
  const horizon = payload.bookableHorizonDays ?? 30;
  const dates = useMemo(
    () => listAvailableDates({ windows: payload.windows }, today, horizon),
    [payload.windows, today, horizon]
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(dates[0] ?? null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ slot: string } | null>(null);

  const bookedSet = useMemo(() => new Set(bookedSlots), [bookedSlots]);
  const slotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return generateSlotsForDate(
      {
        windows: payload.windows,
        durationMinutes: payload.durationMinutes,
        buffer: payload.buffer,
      },
      selectedDate,
      bookedSet
    );
  }, [payload, selectedDate, bookedSet]);

  const accent = payload.brandColor ?? "#0f172a";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !name.trim() || !email.trim()) {
      setError("Pick a slot and fill in name + email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/toshare/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          startLocal: selectedSlot,
          inviteeName: name.trim(),
          inviteeEmail: email.trim(),
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Booking failed.");
      }
      setConfirmed({ slot: selectedSlot });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmed) {
    const slotLabel = formatSlotLabel(confirmed.slot, payload.timezone);
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accent }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900">
              You're booked
            </div>
            <div className="text-xs text-emerald-800">
              {slotLabel}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-emerald-900">
          A confirmation email is on its way to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date picker */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Pick a day
        </div>
        {dates.length === 0 ? (
          <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-500">
            No availability in the next {horizon} days.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dates.slice(0, 14).map((d) => {
              const date = new Date(d + "T00:00:00");
              const isSelected = d === selectedDate;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d);
                    setSelectedSlot(null);
                  }}
                  className={`flex min-w-[72px] flex-col items-center rounded-lg border px-3 py-2 text-sm transition ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                  style={isSelected ? { backgroundColor: accent, borderColor: accent } : undefined}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {DAY_LABEL[date.getDay()]}
                  </span>
                  <span className="text-base font-semibold">
                    {date.getDate()}
                  </span>
                  <span className="text-[10px] opacity-70">
                    {date.toLocaleString(undefined, { month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Slot grid */}
      {selectedDate && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pick a time
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              {payload.timezone} · {payload.durationMinutes} min
            </div>
          </div>
          {slotsForDate.length === 0 ? (
            <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-500">
              No times left on this day.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {slotsForDate.map((s) => {
                const isSelected = s.startLocal === selectedSlot;
                return (
                  <button
                    key={s.startLocal}
                    type="button"
                    onClick={() => setSelectedSlot(s.startLocal)}
                    className={`rounded-lg border px-2 py-2 text-sm transition ${
                      isSelected
                        ? "text-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                    style={
                      isSelected
                        ? { backgroundColor: accent, borderColor: accent }
                        : undefined
                    }
                  >
                    {formatTimeLabel(s.startMinute)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirm form */}
      {selectedSlot && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold tracking-tight">Your details</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">
                Name <span className="text-red-500">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">
                Email <span className="text-red-500">*</span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">
              Anything you'd like to share?
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {busy ? "Booking…" : `Confirm booking`}
          </button>
        </form>
      )}
    </div>
  );
}

function formatSlotLabel(startLocal: string, tz: string): string {
  const d = new Date(startLocal);
  return `${d.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} at ${d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })} (${tz})`;
}
