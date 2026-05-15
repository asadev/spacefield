import Link from "next/link";

/**
 * WindowToggle — pure server component that renders a small inline link
 * group for switching between 5min / 1h / 24h aggregation windows.
 *
 * The toggle is rendered into a server page so we just emit anchor links
 * with the desired `window=` querystring. No client JS needed.
 */
export type WindowKey = "5m" | "1h" | "24h";

export const WINDOW_MINUTES: Record<WindowKey, number> = {
  "5m": 5,
  "1h": 60,
  "24h": 24 * 60,
};

export function parseWindow(value: string | undefined): WindowKey {
  const v = (value ?? "").toLowerCase();
  if (v === "5m" || v === "24h") return v;
  return "1h";
}

export default function WindowToggle({
  basePath,
  current,
  preserveParams,
}: {
  basePath: string;
  current: WindowKey;
  preserveParams?: Record<string, string | undefined>;
}) {
  const opts: Array<{ k: WindowKey; label: string }> = [
    { k: "5m", label: "5 min" },
    { k: "1h", label: "1 hour" },
    { k: "24h", label: "24 hours" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated text-xs">
      {opts.map((o) => {
        const params = new URLSearchParams();
        if (preserveParams) {
          for (const [k, v] of Object.entries(preserveParams)) {
            if (v) params.set(k, v);
          }
        }
        params.set("window", o.k);
        const active = current === o.k;
        return (
          <Link
            key={o.k}
            href={`${basePath}?${params.toString()}`}
            className={`px-3 py-1.5 transition-colors ${
              active
                ? "bg-tool-accent text-white"
                : "text-secondary hover:text-app"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
