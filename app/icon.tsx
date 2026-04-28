import { ImageResponse } from "next/og";

/* Favicon (32x32) — generated dynamically via next/og.
 * Replaces the default Next.js favicon.ico. The dark navy background
 * frames a white squircle mark with a navy 2x2 grid cut-out, so the
 * shape stays legible against tinted browser tab backgrounds. */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0e1a",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 1 C 18.5 1, 23 5.5, 23 12 C 23 18.5, 18.5 23, 12 23 C 5.5 23, 1 18.5, 1 12 C 1 5.5, 5.5 1, 12 1 Z"
            fill="#ffffff"
          />
          <path
            d="M12 5 L12 19 M5 12 L19 12"
            stroke="#0a0e1a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
