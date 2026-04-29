"use client";

/* AgentChatScope — small AI button + scoped chat panel for per-app
 * toolbars (CRM, Launchpad, etc.). Reuses AgentChat with a `scope` prop
 * so the runtime restricts the skill catalog to the active app.
 *
 * The chat panel header shows "AI · CRM" / "AI · Files" so the user
 * always knows their question is scoped.
 */

import { useState } from "react";
import AgentChat, { type AgentChatScope as Scope } from "./AgentChat";

interface Props {
  workspaceId: string;
  scope: NonNullable<Scope>;
  /** Render style — toolbar buttons should typically use 'compact'. */
  variant?: "compact" | "default";
  className?: string;
  title?: string;
}

const LABELS: Record<NonNullable<Scope>, string> = {
  crm: "CRM",
  files: "Files",
  boards: "Boards",
};

export default function AgentChatScope({
  workspaceId,
  scope,
  variant = "compact",
  className,
  title,
}: Props) {
  const [open, setOpen] = useState(false);

  const button =
    variant === "compact" ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Open ${LABELS[scope]} assistant`}
        title={title ?? `Ask the ${LABELS[scope]} assistant`}
        className={
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-tool-accent " +
          (open ? "bg-tool-accent-soft text-tool-accent " : "") +
          (className ?? "")
        }
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.6 5.4L20 9l-4 4 1 6-5-2.7L7 19l1-6-4-4 5.4-1.6L12 2z" />
        </svg>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title ?? `Ask the ${LABELS[scope]} assistant`}
        className={
          "inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 py-1 text-[0.62rem] font-medium uppercase tracking-[0.16em] transition-colors hover:border-tool-accent hover:text-tool-accent " +
          (open ? "border-tool-accent text-tool-accent " : "text-secondary ") +
          (className ?? "")
        }
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.6 5.4L20 9l-4 4 1 6-5-2.7L7 19l1-6-4-4 5.4-1.6L12 2z" />
        </svg>
        AI
      </button>
    );

  return (
    <>
      {button}
      <AgentChat
        open={open}
        onClose={() => setOpen(false)}
        workspaceId={workspaceId}
        scope={scope}
        initialPosition={{ x: 24, y: 96 }}
      />
    </>
  );
}
