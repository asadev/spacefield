/* ─────────────────────────────────────────────────────────────────────────
 * Local icon set for the records surfaces. Same SVG-path-family approach
 * the Shell uses — no external icon package, no extra deps. Phase 2C may
 * swap to TOOL_ICONS once a unified picker arrives.
 * ───────────────────────────────────────────────────────────────────── */

const PATHS: Record<string, string> = {
  search:
    "M10 2a8 8 0 105.3 14L21 21.6l1.4-1.4-5.6-5.6A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z",
  close:
    "M6.4 4.95L4.95 6.4 10.6 12l-5.65 5.6 1.45 1.45L12 13.4l5.6 5.65 1.45-1.45L13.4 12l5.65-5.6L17.6 4.95 12 10.6 6.4 4.95z",
  filter:
    "M3 4h18v2.5l-7 7V21l-4-2v-5.5L3 6.5V4zm2.5 1.5L11 12v5.4l2 1V12l5.5-6.5h-13z",
  sort: "M7 4l-4 4h3v8H4l4 4 4-4H9V8h3L7 4zm10 0v12h-3l4 4 4-4h-3V4h-2z",
  arrow_up: "M11 4h2v12.2l4-4 1.4 1.4L12 20.4l-6.4-6.8L7 12.2l4 4V4z",
  arrow_down: "M11 4h2v12.2l4-4 1.4 1.4L12 20.4l-6.4-6.8L7 12.2l4 4V4z",
  layout_table:
    "M3 4h18v4H3V4zm0 6h18v4H3v-4zm0 6h18v4H3v-4z",
  layout_card:
    "M3 4h8v8H3V4zm10 0h8v8h-8V4zM3 12h8v8H3v-8zm10 0h8v8h-8v-8z",
  more: "M5 12a2 2 0 114 0 2 2 0 01-4 0zm5 0a2 2 0 114 0 2 2 0 01-4 0zm5 0a2 2 0 114 0 2 2 0 01-4 0z",
  trash:
    "M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm3 2v8h2v-8H9zm4 0v8h2v-8h-2z",
  copy: "M8 2h11a2 2 0 012 2v13h-2V4H8V2zm-4 4h11a2 2 0 012 2v13a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zm0 2v13h11V8H4z",
  edit: "M4 17l9-9 4 4-9 9H4v-4zm10-10l3-3 4 4-3 3-4-4z",
  link: "M3 12a5 5 0 015-5h3v2H8a3 3 0 100 6h3v2H8a5 5 0 01-5-5zm10-5h3a5 5 0 010 10h-3v-2h3a3 3 0 000-6h-3V7zM8 11h8v2H8v-2z",
  external:
    "M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4zM4 6h6v2H6v10h10v-4h2v6H4V6z",
  tag: "M2 4l8-2 12 12-10 10L0 12V4zm4 4a2 2 0 100-4 2 2 0 000 4z",
  user: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  briefcase:
    "M10 2h4a2 2 0 012 2v2h4a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h4V4a2 2 0 012-2zm0 4h4V4h-4v2zM4 8v4h16V8H4zm0 6v5h16v-5h-6v2h-4v-2H4z",
  building:
    "M5 3h14v18H5V3zm2 2v3h3V5H7zm5 0v3h3V5h-3zm5 0v3h2V5h-2zM7 10v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2zM7 15v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2z",
  layers:
    "M12 2L2 7l10 5 10-5-10-5zm0 2.2L18.5 7 12 10.3 5.5 7 12 4.2zM2 12l10 5 10-5-2-1-8 4-8-4-2 1zm0 5l10 5 10-5-2-1-8 4-8-4-2 1z",
  paperclip:
    "M21 11l-9 9a5 5 0 11-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 11-3-3l8.5-8.5 1.4 1.4L8 16.4a.5.5 0 00.7.7L17 8.6a2 2 0 00-3-3l-9 9a3 3 0 104 4l9-9 1 1z",
  chevron_down:
    "M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4z",
  chevron_right:
    "M9 6.6L13.4 11l-4.4 4.4 1.4 1.4 5.8-5.8L10.4 5.2 9 6.6z",
  check: "M9 16.2l-4.2-4.2L3.4 13.4 9 19l12-12-1.4-1.4L9 16.2z",
  refresh:
    "M12 4V1L7 6l5 5V7a5 5 0 015 5h2a7 7 0 00-7-8zm-7 8H3a7 7 0 0011 5.9V21l5-5-5-5v3a5 5 0 01-7-2H5z",
  inbox:
    "M3 5h18v9h-5l-1 2h-6l-1-2H3V5zm2 2v5h3l1 2h6l1-2h3V7H5z",
};

export function RecIcon({
  name,
  size = 14,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}
