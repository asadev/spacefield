"use client";

/* AgentChatLauncher — the floating circular button anchored bottom-right
 * of the desktop home. Opens the AgentChat panel.
 *
 * The button is drag-positionable: pointerdown + drag moves the icon
 * around the viewport; pointerdown + release without drag is treated as
 * a click and toggles the chat. Position is persisted in localStorage
 * (anchored bottom-right so the dock corner stays clear by default).
 *
 * Hidden during onboarding and when no workspace is hydrated. Pulses
 * subtly when closed; calms down when the panel is open.
 *
 * The button itself sits at z-30 so it's above the wallpaper + widgets
 * (z-10..13) but well below open windows (z-20+) and overlays.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AgentChat from "./AgentChat";

interface PersonaBody {
  bot_name: string;
}

interface Props {
  workspaceId: string;
  installedAppSlugs?: string[];
}

interface Anchor {
  right: number;
  bottom: number;
}

const STORAGE_KEY = "tools-desktop-agent-launcher-pos-v1";
const DEFAULT_ANCHOR: Anchor = { right: 16, bottom: 96 };
const DRAG_THRESHOLD_PX = 6;

function loadAnchor(): Anchor {
  if (typeof window === "undefined") return DEFAULT_ANCHOR;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ANCHOR;
    const parsed = JSON.parse(raw) as Partial<Anchor>;
    if (
      typeof parsed.right === "number" &&
      typeof parsed.bottom === "number" &&
      Number.isFinite(parsed.right) &&
      Number.isFinite(parsed.bottom)
    ) {
      return {
        right: Math.max(8, parsed.right),
        bottom: Math.max(8, parsed.bottom),
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ANCHOR;
}

function saveAnchor(a: Anchor) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* ignore — quota or private mode */
  }
}

export default function AgentChatLauncher({
  workspaceId,
  installedAppSlugs = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [botName, setBotName] = useState("Assistant");
  const [anchor, setAnchor] = useState<Anchor>(DEFAULT_ANCHOR);
  const [hydrated, setHydrated] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    base: Anchor;
    moved: boolean;
  } | null>(null);

  // Hydrate position from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    setAnchor(loadAnchor());
    setHydrated(true);
  }, []);

  // Lazy load the persona name once per workspace so the panel header
  // can show "AI · <bot_name>".
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agent/persona?workspace_id=${encodeURIComponent(workspaceId)}`
        );
        if (!res.ok) return;
        const body = (await res.json()) as Partial<PersonaBody>;
        if (cancelled) return;
        if (typeof body.bot_name === "string" && body.bot_name.length > 0) {
          setBotName(body.bot_name);
        }
      } catch {
        // ignore — name is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Drag-to-move + tap-to-toggle. We treat a pointerdown→up sequence
  // that never crossed DRAG_THRESHOLD_PX as a click.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: { ...anchor },
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      d.moved = true;
    }
    if (d.moved) {
      // Right-anchored: dragging right (dx>0) reduces the right offset;
      // bottom-anchored: dragging down (dy>0) reduces the bottom offset.
      const next: Anchor = {
        right: Math.max(8, d.base.right - dx),
        bottom: Math.max(8, d.base.bottom - dy),
      };
      setAnchor(next);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (moved) {
      saveAnchor(anchor);
    } else {
      setOpen((v) => !v);
    }
  };

  const buttonStyle: CSSProperties | undefined = hydrated
    ? { right: anchor.right, bottom: anchor.bottom }
    : undefined;

  return (
    <>
      {/* Floating button — bottom-right by default, drag-positionable. */}
      <button
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={buttonStyle}
        className={`pointer-events-auto fixed z-30 flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-full border border-app/40 bg-app-elevated text-tool-accent shadow-xl transition-transform hover:scale-105 active:scale-95 active:cursor-grabbing ${
          hydrated ? "" : "right-4 bottom-24"
        }`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)",
          }}
        />
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2l2.6 5.4L20 9l-4 4 1 6-5-2.7L7 19l1-6-4-4 5.4-1.6L12 2z" />
        </svg>
        {!open && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              animation: "agent-launcher-pulse 2.4s ease-out infinite",
              boxShadow: "0 0 0 0 var(--tool-accent-soft, #c4b5fd)",
            }}
          />
        )}
      </button>

      <AgentChat
        open={open}
        onClose={() => setOpen(false)}
        workspaceId={workspaceId}
        installedAppSlugs={installedAppSlugs}
        botName={botName}
        initialPosition={{ x: 24, y: 96 }}
      />

      <style jsx global>{`
        @keyframes agent-launcher-pulse {
          0% { box-shadow: 0 0 0 0 var(--tool-accent-soft, rgba(124,58,237,0.4)); }
          70% { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
          100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
        }
      `}</style>
    </>
  );
}
