"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { TOOL_ICONS } from "../_data/tools-list";
import { ICON_STYLES, type IconStyleId } from "./icon-styles";
import { useIconStyle } from "./useIconStyle";

interface Props {
  open: boolean;
  onClose: () => void;
}

/* Sample glyphs we'll preview each style with — picked to read clearly at
 * tile size. One repeated glyph would make the variants hard to compare. */
const PREVIEW_GLYPHS: { key: keyof typeof TOOL_ICONS; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "chart", label: "Chart" },
  { key: "wallet", label: "Wallet" },
];

export default function IconStylePicker({ open, onClose }: Props) {
  const { style, setStyle } = useIconStyle();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-label="Icon style"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className="absolute inset-0 backdrop-blur-xl"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="sf-glass-window relative z-10 mx-auto flex max-h-[86vh] w-[min(92vw,640px)] flex-col overflow-hidden rounded-2xl"
            style={{ marginTop: "10vh" }}
          >
            {/* Header */}
            <div className="sf-glass-titlebar flex items-center gap-3 px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-strong text-app">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={TOOL_ICONS.dots9} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">Icon style</div>
                <div className="text-[11px] text-muted">
                  Pick how dock and Launchpad icons render. Saved on this device.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close icon style picker"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Style grid */}
            <div className="grid grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {ICON_STYLES.map((s) => (
                <StyleCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  description={s.description}
                  active={style === s.id}
                  onPick={() => setStyle(s.id)}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StyleCard({
  id,
  name,
  description,
  active,
  onPick,
}: {
  id: IconStyleId;
  name: string;
  description: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors ${
        active
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app hover:border-app-hover"
      }`}
      aria-pressed={active}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-app">{name}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted">
            {description}
          </div>
        </div>
        {active && (
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tool-accent text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
        )}
      </div>
      <div className="flex items-end gap-3 rounded-lg bg-surface px-3 py-3">
        {PREVIEW_GLYPHS.map((g) => (
          <PreviewTile key={g.key} style={id} iconKey={g.key} />
        ))}
      </div>
    </button>
  );
}

/* A single sample tile rendered in the requested style. Mirrors the dock
 * geometry so what users see here is what they'll get on the desktop. */
function PreviewTile({
  style,
  iconKey,
}: {
  style: IconStyleId;
  iconKey: keyof typeof TOOL_ICONS;
}) {
  const path = TOOL_ICONS[iconKey] ?? TOOL_ICONS.home;

  let wrapperCls: string;
  let glyphTone: string;
  switch (style) {
    case "filled":
      wrapperCls =
        "flex h-12 w-12 items-center justify-center rounded-xl bg-tool-accent text-white shadow-sm";
      glyphTone = "text-white";
      break;
    case "squircle":
      wrapperCls =
        "flex h-12 w-12 items-center justify-center rounded-[28%] bg-tool-accent-soft text-tool-accent shadow-md ring-1 ring-inset ring-tool-accent/25";
      glyphTone = "text-tool-accent";
      break;
    case "rounded-square":
      wrapperCls =
        "flex h-12 w-12 items-center justify-center rounded-lg border border-app bg-app-elevated text-secondary";
      glyphTone = "text-secondary";
      break;
    case "hairline":
    default:
      wrapperCls =
        "flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-secondary";
      glyphTone = "text-secondary";
      break;
  }

  return (
    <span className={wrapperCls}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={glyphTone}
      >
        <path d={path} />
      </svg>
    </span>
  );
}
