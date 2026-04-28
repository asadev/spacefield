import { ImageResponse } from "next/og";

/* Open Graph image (1200x630) — used by social platforms (Twitter,
 * Facebook, Slack, iMessage previews). Renders the Spacefield mark
 * + wordmark on a soft navy gradient with a one-line tagline. */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Space Field — your desktop in a browser";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "0 96px",
          background:
            "linear-gradient(135deg, #0a0e1a 0%, #131a2e 55%, #1d2444 100%)",
          color: "#ffffff",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 40,
          }}
        >
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 1 C 18.5 1, 23 5.5, 23 12 C 23 18.5, 18.5 23, 12 23 C 5.5 23, 1 18.5, 1 12 C 1 5.5, 5.5 1, 12 1 Z"
              fill="#ffffff"
            />
            <path
              d="M12 5 L12 19 M5 12 L19 12"
              stroke="#0a0e1a"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 72,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Space Field
          </span>
        </div>
        <span
          style={{
            fontSize: 44,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "#c8cfe4",
            lineHeight: 1.15,
            maxWidth: 920,
          }}
        >
          Your desktop in a browser. Tools, files, and workspaces — all in one place.
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 64,
            left: 96,
            fontSize: 28,
            fontWeight: 500,
            color: "#7d88a8",
            letterSpacing: "0.04em",
          }}
        >
          spacefield.co
        </span>
      </div>
    ),
    size,
  );
}
