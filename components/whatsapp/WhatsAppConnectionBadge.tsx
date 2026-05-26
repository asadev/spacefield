"use client";

/* WhatsAppConnectionBadge — tiny WhatsApp connection-status indicator.
 *
 * Drop into the top bar or sidebar of any surface that wants a quick
 * "is WhatsApp live?" affordance. Polls every 30s on mount, never on
 * focus thrash. Click → /tools/whatsapp?tab=connection.
 *
 * Hides entirely when no workspace is selected — no UI noise for users
 * who don't even use the app. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import {
  fetchInstanceStatus,
  type WaInstance,
  type WaInstanceStatus,
} from "@/app/tools/whatsapp/_components/api";

const POLL_MS = 30_000;

const STATUS_LABEL: Record<WaInstanceStatus, string> = {
  pending: "starting",
  qr_pending: "pairing",
  connected: "live",
  disconnected: "offline",
  banned: "banned",
  error: "error",
};

const STATUS_DOT: Record<WaInstanceStatus, string> = {
  pending: "bg-amber-500",
  qr_pending: "bg-sky-500 animate-pulse",
  connected: "bg-emerald-500",
  disconnected: "bg-rose-500",
  banned: "bg-rose-500",
  error: "bg-rose-500",
};

interface Props {
  /** Override the auto-detected workspace id (e.g. for a workspace-card preview). */
  workspaceId?: string;
  /** When true, omit the text label and render just the dot — useful in
   * cramped top bars. Defaults to false. */
  iconOnly?: boolean;
  /** When true, do not wrap with a Link — host renders its own click target. */
  unwrapped?: boolean;
}

export default function WhatsAppConnectionBadge({
  workspaceId,
  iconOnly = false,
  unwrapped = false,
}: Props) {
  const { current } = useWorkspace();
  const effectiveWsId = workspaceId ?? (current.kind === "team" ? current.id : "");

  const [instance, setInstance] = useState<WaInstance | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!effectiveWsId) return;
    let alive = true;
    const tick = async () => {
      const res = await fetchInstanceStatus(effectiveWsId);
      if (!alive) return;
      if (res.ok) setInstance(res.data);
      setLoaded(true);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [effectiveWsId]);

  // Hide entirely when there's no team workspace or we haven't loaded yet
  // and there's no prior state to show.
  if (!effectiveWsId || (!loaded && !instance)) {
    return null;
  }

  const status: WaInstanceStatus = instance?.status ?? "disconnected";
  const label = STATUS_LABEL[status];

  const inner = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary transition-colors hover:bg-surface"
      aria-label={`WhatsApp ${label}`}
      title={`WhatsApp: ${label}${instance?.phone_number ? ` (${instance.phone_number})` : ""}`}
    >
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
      {!iconOnly ? (
        <span className="hidden sm:inline">WhatsApp · {label}</span>
      ) : null}
      {!iconOnly ? <span className="sm:hidden">WA</span> : null}
    </span>
  );

  if (unwrapped) return inner;

  return (
    <Link
      href="/tools/whatsapp?tab=connection"
      prefetch={false}
      className="inline-flex"
    >
      {inner}
    </Link>
  );
}
