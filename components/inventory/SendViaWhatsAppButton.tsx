"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * SendViaWhatsAppButton
 *
 * Drop-in button for inventory rows + the item detail panel. Opens the
 * InventoryWhatsAppComposer modal so the user can compose + send a
 * WhatsApp blast for this product.
 *
 * Visibility logic (all best-effort, tolerant of partial deploys —
 * Agent A / Agent B may not have shipped the WA stack yet):
 *
 *   • If the workspace doesn't have the `whatsapp` tool available
 *     (per `/api/tools/availability`), we render NOTHING.
 *   • If the tool IS available but Agent A's /api/whatsapp/status
 *     reports "not paired" — show the button, but disabled with a
 *     tooltip pointing the user to /tools/whatsapp.
 *   • Otherwise — fully active.
 *
 * The visibility check is async; we render a tiny skeleton while it
 * resolves so the row doesn't reflow visibly. After resolution we
 * cache the verdict per slug+workspace in module memory so the same
 * row doesn't refetch on every render.
 * ─────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import InventoryWhatsAppComposer, {
  type ComposerItem,
} from "./InventoryWhatsAppComposer";

const WHATSAPP_SLUG = "whatsapp";

type Verdict =
  | "loading"
  | "hidden" // tool not installed / not allowed
  | "unpaired" // tool allowed but not paired yet
  | "ready"; // good to go

interface CacheEntry {
  verdict: Verdict;
  loadedAt: number;
}

const CACHE: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60 * 1000;

interface Props {
  itemId: string;
  workspaceId: string;
  item: ComposerItem;
  /** Visual variant — "compact" for row-action menus, "default" for the
   *  item detail panel. */
  variant?: "default" | "compact";
}

/**
 * Lookup the availability + pairing verdict for the current workspace.
 * The result is memoised in module memory for a minute so we don't
 * thrash the network on every row render.
 */
async function loadVerdict(workspaceId: string): Promise<Verdict> {
  const cacheKey = `${workspaceId}:${WHATSAPP_SLUG}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.verdict;

  let verdict: Verdict = "hidden";
  try {
    const r = await fetch("/api/tools/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, slugs: [WHATSAPP_SLUG] }),
    });
    if (r.ok) {
      const j = (await r.json()) as {
        availability?: Record<string, string>;
      };
      const state = j.availability?.[WHATSAPP_SLUG];
      if (state === "allowed") verdict = "ready";
      else verdict = "hidden";
    } else if (r.status === 401) {
      // Not signed in inside the iframe — bail gracefully.
      verdict = "hidden";
    } else {
      verdict = "hidden";
    }
  } catch {
    verdict = "hidden";
  }

  // Pairing probe — only meaningful when allowed.
  if (verdict === "ready") {
    try {
      const r = await fetch(
        `/api/whatsapp/status?workspace_id=${encodeURIComponent(workspaceId)}`,
        { method: "GET" }
      );
      if (r.ok) {
        const j = (await r.json()) as {
          paired?: boolean;
          status?: string;
        };
        const isPaired =
          j.paired === true ||
          j.status === "paired" ||
          j.status === "connected";
        if (!isPaired) verdict = "unpaired";
      } else if (r.status === 404) {
        // Agent A's status endpoint hasn't landed yet — assume ready.
        // We'd rather be optimistic and surface an inline error on
        // Send than refuse to show the button.
      } else {
        // Don't downgrade to hidden on 500 — keep the button visible.
      }
    } catch {
      // Network error — be optimistic.
    }
  }

  CACHE.set(cacheKey, { verdict, loadedAt: Date.now() });
  return verdict;
}

function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  // Simplified WhatsApp-style speech-bubble glyph. Uses inline SVG to
  // avoid adding a runtime icon dependency. Color flows from
  // `currentColor` so the parent button controls hue.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export default function SendViaWhatsAppButton({
  itemId,
  workspaceId,
  item,
  variant = "default",
}: Props) {
  const [verdict, setVerdict] = useState<Verdict>("loading");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const v = await loadVerdict(workspaceId);
      if (!cancelled) setVerdict(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleOpen = useCallback(() => {
    if (verdict !== "ready") return;
    setOpen(true);
  }, [verdict]);

  // While we're still resolving and the variant is "compact" (row
  // action menu), avoid flicker by rendering nothing — the menu will
  // pop in once we know.
  if (verdict === "loading") {
    if (variant === "compact") return null;
    return (
      <span
        className="inline-flex h-8 w-32 items-center rounded-md border border-app bg-app-elevated px-3 text-[0.65rem] text-faint"
        aria-hidden="true"
      >
        Checking WhatsApp…
      </span>
    );
  }

  if (verdict === "hidden") return null;

  const unpaired = verdict === "unpaired";

  const compactClass = unpaired
    ? "inline-flex h-7 items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 text-[0.65rem] text-faint cursor-not-allowed"
    : "inline-flex h-7 items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 text-[0.65rem] text-app hover:border-tool-accent hover:text-tool-accent";

  const defaultClass = unpaired
    ? "inline-flex h-8 items-center gap-2 rounded-md border border-app bg-app-elevated px-3 text-[0.7rem] font-medium text-faint cursor-not-allowed"
    : "inline-flex h-8 items-center gap-2 rounded-md border border-app bg-app-elevated px-3 text-[0.7rem] font-medium text-app hover:border-emerald-500/60 hover:text-emerald-500";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={unpaired}
        title={
          unpaired
            ? "Pair WhatsApp first in /tools/whatsapp"
            : "Compose a WhatsApp blast for this item"
        }
        aria-disabled={unpaired}
        className={variant === "compact" ? compactClass : defaultClass}
      >
        <WhatsAppGlyph size={variant === "compact" ? 12 : 14} />
        <span>Send via WhatsApp</span>
      </button>
      {open && (
        <InventoryWhatsAppComposer
          itemId={itemId}
          workspaceId={workspaceId}
          item={item}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
