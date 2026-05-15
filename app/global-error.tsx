"use client";

import { useEffect } from "react";

/* Global error boundary — fires when an error happens INSIDE the root
 * layout itself (e.g. a provider crashes). Next.js requires this to
 * include its own <html> + <body> because the normal layout never
 * mounted. Keep it dependency-free so it works even if React context
 * setup is what failed. */

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  // Surface the error to the browser console so server-side log capture
  // (and operator devtools) can pick it up. Best-effort only — never
  // throw from this hook because we're already in the error boundary.
  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.error(
        "[global-error]",
        error?.message,
        error?.digest ? `digest=${error.digest}` : "",
        error?.stack ?? ""
      );
    } catch {
      /* noop */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050507",
          color: "#f4f4f5",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: "0 1.5rem",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#71717a",
              marginBottom: "1rem",
            }}
          >
            Critical error
          </p>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              marginBottom: "1rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#a1a1aa",
              lineHeight: 1.6,
              marginBottom: "1rem",
            }}
          >
            {/* SC-004 — never render error.message to end users. The
             * full error is in server logs; the user sees only the
             * opaque digest below. */}
            Space Field hit an unexpected error before the page could
            render. Try reloading.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.65rem",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#71717a",
                marginBottom: "2rem",
                wordBreak: "break-all",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.08)",
              padding: "0.875rem 1.75rem",
              fontSize: "0.75rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#fff",
              cursor: "pointer",
              borderRadius: 0,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
