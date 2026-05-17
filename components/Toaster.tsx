"use client";

import { useEffect, useRef, useState } from "react";

import { parseQueryToast, toast, type Toast } from "@/lib/toast";

/**
 * Single global toast renderer.
 *
 * Subscribes to `lib/toast`'s pub-sub bus and renders a bottom-right
 * stack. Each toast auto-dismisses after its `ttl`, and the user can
 * dismiss early by clicking the ×. We also pick up `?toast=kind:msg`
 * query params on mount (so Server Actions that `redirect()` can
 * surface a toast on the next page) and strip them with
 * `history.replaceState` so reload doesn't re-fire.
 *
 * Mounted once in `app/layout.tsx`.
 */
export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Subscribe once. Each incoming toast is appended and a dismiss timer
  // is scheduled. We keep a max of 5 visible at once — older items are
  // pushed out the top to avoid the stack growing off-screen on a busy
  // page.
  useEffect(() => {
    const timerMap = timers.current;
    const unsub = toast.subscribe((t) => {
      setItems((prev) => {
        const next = [...prev, t];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });
      const handle = setTimeout(() => {
        dismiss(t.id);
      }, t.ttl);
      timerMap.set(t.id, handle);
    });
    return () => {
      unsub();
      for (const handle of timerMap.values()) clearTimeout(handle);
      timerMap.clear();
    };
  }, []);

  // Pick up redirect-style toasts from the URL on mount + on path change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("toast");
    const parsed = parseQueryToast(raw);
    if (!parsed) return;
    toast[parsed.kind](parsed.message);
    url.searchParams.delete("toast");
    const qs = url.searchParams.toString();
    const replaced =
      url.pathname + (qs ? `?${qs}` : "") + (url.hash || "");
    window.history.replaceState(window.history.state, "", replaced);
  }, []);

  function dismiss(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[9998] flex w-[min(360px,calc(100vw-2rem))] flex-col-reverse gap-2"
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    // Defer one frame so the initial state can transition.
    const handle = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  const kindStyles = STYLES[t.kind];

  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out ${
        kindStyles.box
      } ${
        entered
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-xs ${kindStyles.icon}`}
      >
        {kindStyles.glyph}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-snug text-app">
        {t.message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 flex-shrink-0 rounded text-muted transition-colors hover:text-app focus:outline-none focus:ring-1 focus:ring-app"
      >
        <span aria-hidden className="text-base leading-none">×</span>
      </button>
    </div>
  );
}

const STYLES: Record<
  Toast["kind"],
  { box: string; icon: string; glyph: string }
> = {
  info: {
    box: "border-app bg-app-elevated/95",
    icon: "text-sky-500",
    glyph: "i",
  },
  success: {
    box: "border-emerald-500/40 bg-app-elevated/95",
    icon: "text-emerald-500",
    glyph: "✓",
  },
  warn: {
    box: "border-amber-500/40 bg-app-elevated/95",
    icon: "text-amber-500",
    glyph: "!",
  },
  error: {
    box: "border-red-500/40 bg-app-elevated/95",
    icon: "text-red-500",
    glyph: "×",
  },
};
