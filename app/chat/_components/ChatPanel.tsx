"use client";

/* app/chat/_components/ChatPanel.tsx — thin client wrapper that mounts
 * the shared `AIStreamView` against `/api/chat/stream`.
 *
 * Lives in its own file so the page can stay a server component and
 * still benefit from server-loaded context (workspace_id, title, etc.).
 */

import AIStreamView from "@/components/AIStreamView";

export interface ChatPanelProps {
  contextRef: string | null;
  workspaceId: string | null;
  placeholder: string;
  initialMessage: string | null;
}

export default function ChatPanel({
  contextRef,
  workspaceId,
  placeholder,
  initialMessage,
}: ChatPanelProps) {
  return (
    <AIStreamView
      endpoint="/api/chat/stream"
      extraBody={{
        context_ref: contextRef,
        workspace_id: workspaceId,
      }}
      placeholder={placeholder}
      initialMessage={initialMessage ?? undefined}
      stickyInput
    />
  );
}
