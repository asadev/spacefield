"use client";

/* components/StopGenerationButton.tsx — abort button for any streaming
 * AI surface. Shown while a `useAIStream()` hook is in "streaming"
 * status; clicking calls `stop()` which aborts the underlying fetch and
 * signals the server route to bail out of its upstream Anthropic stream.
 *
 * Visual: square stop icon, matches the design system token set we use
 * elsewhere (bg-app-elevated + border-app + tool-accent on hover).
 */

import { useEffect, useState } from "react";

export interface StopGenerationButtonProps {
  /** Called when the user clicks. Pass `stop` from `useAIStream`. */
  onStop: () => void;
  /** When false the button is hidden entirely. Pass
   *  `state.status === "streaming"` from `useAIStream`. */
  visible: boolean;
  /** Optional class additions for the wrapper button. */
  className?: string;
  /** Custom label text. Defaults to "Stop generating". */
  label?: string;
}

export default function StopGenerationButton({
  onStop,
  visible,
  className,
  label = "Stop generating",
}: StopGenerationButtonProps) {
  // Tiny animated ellipsis so the user can see the stream is alive even
  // when the model is between tokens. Pure CSS would be fine but a JS
  // counter is one less stylesheet rule to maintain.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % 4), 400);
    return () => window.clearInterval(id);
  }, [visible]);
  if (!visible) return null;

  const dots = ".".repeat(tick);

  return (
    <button
      type="button"
      onClick={onStop}
      aria-label={label}
      className={
        "inline-flex items-center gap-2 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-tool-accent hover:text-app focus:outline-none focus-visible:ring-2 focus-visible:ring-tool-accent " +
        (className ?? "")
      }
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden
        className="text-tool-accent"
      >
        <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
      </svg>
      <span>
        {label}
        <span aria-hidden className="inline-block w-3 text-left">
          {dots}
        </span>
      </span>
    </button>
  );
}
