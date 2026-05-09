"use client";

import { useState } from "react";

// Inline because _lib.ts is "server-only" and importing it into a
// client component would crash the build. Keep this string identical
// to `inputClass` in app/admin/_lib.ts.
const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

/**
 * Combined HTML5 color picker + text input. The two stay in sync:
 * - Picker change → updates the text input.
 * - Text input change → if it parses as valid hex, updates the picker
 *   swatch; otherwise the swatch holds its last valid value.
 */
export default function ColorInput({
  name,
  initial,
}: {
  name: string;
  initial: string | null;
}) {
  const initialText = initial ?? "";
  const initialSwatch = isValidHex(initialText)
    ? padHex(initialText)
    : "#000000";

  const [text, setText] = useState(initialText);
  const [swatch, setSwatch] = useState(initialSwatch);

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={swatch}
        aria-label={`${name} swatch`}
        onChange={(e) => {
          const next = e.target.value;
          setSwatch(next);
          setText(next);
        }}
        className="h-9 w-12 cursor-pointer rounded-md border border-app bg-app"
      />
      <input
        type="text"
        name={name}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (isValidHex(next)) {
            setSwatch(padHex(next));
          }
        }}
        placeholder="#3b82f6"
        maxLength={9}
        className={`${inputClass} font-mono`}
      />
    </div>
  );
}

function isValidHex(s: string): boolean {
  return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$|^#?[0-9a-fA-F]{8}$/.test(s);
}

function padHex(s: string): string {
  let h = s.startsWith("#") ? s.slice(1) : s;
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 8) h = h.slice(0, 6);
  return `#${h}`;
}
