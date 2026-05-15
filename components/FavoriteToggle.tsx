"use client";

/* FavoriteToggle — star button. Drop it on any entity row/detail view
 * to let the user pin it to their personal favorites sidebar. Click is
 * optimistic; we roll back on API failure so the UI stays honest. */

import { useState, useTransition } from "react";

interface Props {
  entityType: string;
  entityId: string;
  initialFavorited?: boolean;
  workspaceId?: string | null;
  label?: string | null;
  size?: "sm" | "md";
}

export default function FavoriteToggle({
  entityType,
  entityId,
  initialFavorited = false,
  workspaceId = null,
  label = null,
  size = "sm",
}: Props) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const next = !favorited;
    // Optimistic flip first; roll back inside the transition if the
    // network call fails. This makes the click feel instant even on
    // flaky networks.
    setFavorited(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/favorites", {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: entityType,
            entity_id: entityId,
            workspace_id: workspaceId,
            label,
          }),
        });
        if (!res.ok) setFavorited(!next);
      } catch {
        setFavorited(!next);
      }
    });
  }

  const dim = size === "md" ? 16 : 14;

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      onClick={onClick}
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-md transition-colors ${
        size === "md" ? "h-7 w-7" : "h-6 w-6"
      } ${favorited ? "text-amber-400 hover:text-amber-300" : "text-faint hover:text-secondary"}`}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill={favorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M12 2.5l2.96 6 6.62.96-4.79 4.67 1.13 6.59L12 17.6 6.08 20.72l1.13-6.59L2.42 9.46l6.62-.96L12 2.5z" />
      </svg>
    </button>
  );
}
