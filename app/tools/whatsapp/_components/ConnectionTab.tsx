"use client";

/* Connection tab — instance pairing + health.
 *
 * Lifecycle
 * ─────────
 *  no instance / disconnected → "Pair your shop WhatsApp" CTA
 *      ↓ POST /api/whatsapp/instance/create
 *  qr_pending  → render QR, poll /connect every 3s until status flips
 *      ↓
 *  connected   → show phone + paired_at + send-health + caps
 *      ↓ user clicks Disconnect
 *  → confirm modal → DELETE /api/whatsapp/instance/delete → back to start
 *
 * Pairing QR comes from Evolution as a base64 data-URL OR as a code string.
 * If the server returns a code string we re-render it client-side via the
 * qrcode lib (already in deps for the format-converters tool). */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceRole } from "@/app/tools/_components/useWorkspaceRole";
import * as QrLib from "qrcode";
import {
  connectInstance,
  createInstance,
  deleteInstance,
  fetchInstanceStatus,
  type WaInstance,
  type WaInstanceStatus,
} from "./api";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

const STATUS_POLL_MS = 30_000;
const QR_POLL_MS = 3_000;

const STATUS_LABEL: Record<WaInstanceStatus, string> = {
  pending: "Pending",
  qr_pending: "Scan QR",
  connected: "Connected",
  disconnected: "Disconnected",
  banned: "Banned",
  error: "Error",
};

const STATUS_TONE: Record<
  WaInstanceStatus,
  "neutral" | "success" | "warn" | "danger" | "info"
> = {
  pending: "neutral",
  qr_pending: "info",
  connected: "success",
  disconnected: "warn",
  banned: "danger",
  error: "danger",
};

export default function ConnectionTab({ workspaceId, compact }: Props) {
  const [instance, setInstance] = useState<WaInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [renderedQr, setRenderedQr] = useState<string | null>(null);

  const { canOwn } = useWorkspaceRole();
  const canManage = canOwn;

  const pollHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetchInstanceStatus(workspaceId);
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return null;
    }
    setInstance(res.data);
    setLoading(false);
    return res.data;
  }, [workspaceId]);

  // Initial load + background poll while not pairing.
  useEffect(() => {
    let alive = true;
    refresh();

    const tick = () => {
      if (!alive) return;
      const status = instance?.status;
      const interval =
        status === "qr_pending" || status === "pending" ? QR_POLL_MS : STATUS_POLL_MS;
      pollHandle.current = setTimeout(async () => {
        await refresh();
        tick();
      }, interval);
    };
    tick();
    return () => {
      alive = false;
      if (pollHandle.current) clearTimeout(pollHandle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, instance?.status]);

  // Render QR client-side if API returned a code string rather than a data URL.
  useEffect(() => {
    const raw = instance?.qr_code ?? null;
    if (!raw) {
      setRenderedQr(null);
      return;
    }
    if (raw.startsWith("data:image")) {
      setRenderedQr(raw);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await QrLib.toDataURL(raw, {
          margin: 1,
          width: 280,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setRenderedQr(dataUrl);
      } catch {
        if (!cancelled) setRenderedQr(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instance?.qr_code]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await createInstance(workspaceId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // The /create endpoint returns an immediate QR; fold it into the status object.
    setInstance((prev) => ({
      ...(prev ?? { status: "qr_pending" }),
      status: "qr_pending",
      qr_code: res.data.qr_code ?? prev?.qr_code ?? null,
    }));
  }, [workspaceId]);

  const handleReconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await connectInstance(workspaceId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInstance((prev) => ({
      ...(prev ?? { status: res.data.status }),
      status: res.data.status,
      qr_code: res.data.qr_code ?? prev?.qr_code ?? null,
    }));
  }, [workspaceId]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await deleteInstance(workspaceId);
    setBusy(false);
    setConfirmDisconnect(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInstance(null);
    setRenderedQr(null);
    await refresh();
  }, [workspaceId, refresh]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
          loading instance…
        </div>
      </div>
    );
  }

  if (error && !instance) {
    return (
      <div className="p-4">
        <ErrorBlock body={error} onRetry={refresh} />
      </div>
    );
  }

  // No instance yet — first-run pairing
  if (!instance || instance.status === "disconnected" || instance.status === "error") {
    return (
      <EmptyState
        kicker="whatsapp.pair"
        compact={compact}
        title="Pair your shop WhatsApp"
        body={
          <div className="space-y-2">
            <p>
              Connect a WhatsApp number to send & receive messages from this
              workspace. The number can also be used normally from your phone —
              replies sync here automatically.
            </p>
            <p className="text-xs text-faint">
              Pairing uses Evolution gateway (multi-tenant). Each workspace gets
              its own isolated instance.
            </p>
          </div>
        }
        cta={
          <div className="flex flex-col items-center gap-2">
            <PrimaryButton onClick={handleCreate} loading={busy} disabled={!canManage}>
              Start pairing
            </PrimaryButton>
            {!canManage ? (
              <p className="text-xs text-faint">
                Only the workspace owner can pair WhatsApp.
              </p>
            ) : null}
            {error ? <ErrorBlock body={error} onRetry={handleCreate} /> : null}
          </div>
        }
      />
    );
  }

  if (instance.status === "qr_pending" || instance.status === "pending") {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-app p-6">
        <div
          className="w-full rounded-xl border border-app bg-app-elevated p-6 text-center"
          style={{ maxWidth: compact ? "100%" : 520 }}
        >
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
            whatsapp.pair
          </div>
          <h3 className="mt-2 text-base font-semibold text-app">
            Scan with your phone
          </h3>
          <p className="mt-1 text-sm text-secondary">
            Open WhatsApp → Settings → Linked devices → Link a device.
          </p>
          <div className="mt-4 flex justify-center">
            {renderedQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={renderedQr}
                alt="WhatsApp pairing QR code"
                width={compact ? 220 : 280}
                height={compact ? 220 : 280}
                className="rounded-md border border-app bg-white p-2"
              />
            ) : (
              <div
                className="flex h-[260px] w-[260px] items-center justify-center rounded-md border border-dashed border-app bg-surface text-xs text-faint"
                aria-live="polite"
              >
                <span className="flex items-center gap-2">
                  <MiniIcon name="qr" size={18} /> waiting for QR…
                </span>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Pill tone={STATUS_TONE[instance.status]}>
              {STATUS_LABEL[instance.status]}
            </Pill>
            <SecondaryButton onClick={refresh} disabled={busy}>
              <MiniIcon name="refresh" /> Refresh QR
            </SecondaryButton>
            {canManage ? (
              <DangerButton onClick={handleDelete} disabled={busy}>
                Cancel
              </DangerButton>
            ) : null}
          </div>
          {error ? (
            <div className="mt-3">
              <ErrorBlock body={error} onRetry={refresh} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (instance.status === "banned") {
    return (
      <EmptyState
        kicker="whatsapp.banned"
        compact={compact}
        title="This number was banned by WhatsApp"
        body={
          <div className="space-y-2 text-left">
            <p>
              Meta detected unusual activity and disabled the number. Most
              common cause: too many cold messages too fast.
            </p>
            <p className="text-xs text-faint">
              Wait 24h then disconnect + repair with a different SIM. The
              warm-up cap exists to prevent this happening again.
            </p>
          </div>
        }
        cta={
          canManage ? (
            <DangerButton onClick={() => setConfirmDisconnect(true)} disabled={busy}>
              Disconnect this number
            </DangerButton>
          ) : null
        }
      />
    );
  }

  // Connected — main dashboard
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-app p-4">
      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Pill tone="success">
                <MiniIcon name="check" /> Connected
              </Pill>
              {instance.health && instance.health !== "good" ? (
                <Pill
                  tone={
                    instance.health === "throttled" || instance.health === "warn"
                      ? "warn"
                      : "info"
                  }
                >
                  {instance.health}
                </Pill>
              ) : null}
            </div>
            <div className="mt-2 truncate font-mono text-sm text-app">
              {instance.phone_number ?? "Unknown number"}
            </div>
            <div className="mt-0.5 text-xs text-faint">
              Paired {formatRelative(instance.paired_at)}
              {instance.last_seen_at ? (
                <> · Last seen {formatRelative(instance.last_seen_at)}</>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SecondaryButton onClick={refresh} disabled={busy}>
              <MiniIcon name="refresh" /> Refresh
            </SecondaryButton>
            {canManage ? (
              <DangerButton
                onClick={() => setConfirmDisconnect(true)}
                disabled={busy}
              >
                Disconnect
              </DangerButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* Warm-up + caps */}
      {instance.warmup_day && instance.warmup_day <= 14 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <MiniIcon name="warning" /> Warming up — day {instance.warmup_day} of 14
          </div>
          <p className="mt-1 text-xs opacity-90">
            Sending is capped at {instance.daily_cap ?? 30}/day to avoid ban
            detection. Caps lift gradually as the number ages.
          </p>
        </div>
      ) : null}

      <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-3"}`}>
        <Metric
          label="Sent today"
          value={instance.sent_today ?? 0}
          cap={instance.daily_cap ?? null}
          unit="messages"
        />
        <Metric
          label="Sent this hour"
          value={instance.sent_this_hour ?? 0}
          cap={instance.hourly_cap ?? null}
          unit="messages"
        />
        <HealthCard health={instance.health ?? null} />
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {confirmDisconnect ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDisconnect(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-app bg-app-elevated p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-app">Disconnect WhatsApp?</h4>
            <p className="mt-2 text-sm text-secondary">
              Pending sends will fail. You can re-pair anytime — message history
              stays in this workspace.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <SecondaryButton
                onClick={() => setConfirmDisconnect(false)}
                disabled={busy}
              >
                Cancel
              </SecondaryButton>
              <DangerButton onClick={handleDelete} disabled={busy}>
                Yes, disconnect
              </DangerButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Show reconnect button if status is showing something funky */}
      {instance.status === "connected" && instance.health === "warn" ? (
        <button
          type="button"
          onClick={handleReconnect}
          className="text-left font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent underline"
        >
          Force reconnect
        </button>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  cap,
  unit,
}: {
  label: string;
  value: number;
  cap: number | null;
  unit: string;
}) {
  const pct = cap && cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-app">{value}</span>
        {cap !== null ? (
          <span className="text-xs text-secondary">/ {cap}</span>
        ) : null}
        <span className="ml-1 text-xs text-faint">{unit}</span>
      </div>
      {cap !== null ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface">
          <div
            className={`h-full ${pct >= 95 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function HealthCard({
  health,
}: {
  health: WaInstance["health"];
}) {
  const tone =
    health === "good"
      ? "success"
      : health === "warming"
      ? "info"
      : health === "warn" || health === "throttled"
      ? "warn"
      : health === "banned"
      ? "danger"
      : "neutral";
  const label = health ?? "unknown";
  const body =
    health === "good"
      ? "All checks passing. Throughput unrestricted."
      : health === "warming"
      ? "New number — caps are conservative for the first 14 days."
      : health === "throttled"
      ? "Hourly cap reached — sends will resume next hour."
      : health === "warn"
      ? "Recent delivery failures elevated. Slow down sends."
      : health === "banned"
      ? "Meta-side ban detected. Disconnect to re-pair."
      : "No telemetry yet.";

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        Send health
      </div>
      <div className="mt-2">
        <Pill tone={tone}>{label}</Pill>
      </div>
      <p className="mt-2 text-xs text-secondary">{body}</p>
    </div>
  );
}
