"use client";

/* AgentChatLauncher — the floating circular button anchored bottom-left
 * of the desktop home. Opens the AgentChat panel.
 *
 * Hidden during onboarding and when no workspace is hydrated. Pulses
 * subtly when closed; calms down when the panel is open.
 *
 * The button itself sits at z-30 so it's above the wallpaper + widgets
 * (z-10..13) but well below open windows (z-20+) and overlays.
 */

import { useEffect, useState } from "react";
import AgentChat from "./AgentChat";

interface PersonaBody {
  bot_name: string;
}

interface Props {
  workspaceId: string;
}

export default function AgentChatLauncher({ workspaceId }: Props) {
  const [open, setOpen] = useState(false);
  const [botName, setBotName] = useState("Assistant");

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

  return (
    <>
      {/* Floating button — bottom-left corner. We sit slightly inset so
       *  the bottom-left dock corner stays clear. */}
      <button
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto fixed bottom-24 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-app/40 bg-app-elevated/70 text-tool-accent shadow-xl backdrop-blur-2xl transition-transform hover:scale-105 active:scale-95"
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
