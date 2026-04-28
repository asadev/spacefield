import { ImageResponse } from "next/og";

/* Apple touch icon (180x180) — same mark as /icon, scaled up.
 * iOS uses this for home-screen shortcuts and Safari pinned tabs. */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: 40,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
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
