/**
 * Inline-SVG sparkline of recent provider health checks. Each tick is
 * one ping; height = latency (clipped at 5s for readability), green if
 * ok, rose if not. Renders with no external libs.
 */

export type HealthPoint = {
  checked_at: string;
  status: string;
  latency_ms: number | null;
  error: string | null;
};

export default function HealthSparkline({
  points,
  width = 320,
  height = 48,
}: {
  points: HealthPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-app text-[10px] text-faint">
        No health checks yet
      </div>
    );
  }

  // Sort oldest → newest for left-to-right reading.
  const ordered = [...points].sort(
    (a, b) =>
      new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  );

  const cap = 5000; // 5s ceiling
  const minLatency = 50; // floor so an "ok 0ms" still draws a visible bar
  const barW = Math.max(2, Math.floor(width / Math.max(ordered.length, 1)) - 1);
  const innerH = height - 4;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Provider health sparkline"
      className="block"
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        className="fill-app/40"
      />
      {ordered.map((p, idx) => {
        const ok = p.status === "ok";
        const lat = Math.max(
          minLatency,
          Math.min(cap, p.latency_ms ?? cap)
        );
        const ratio = lat / cap;
        const h = Math.max(2, Math.round(ratio * innerH));
        const x = Math.round((idx / Math.max(ordered.length, 1)) * width);
        const y = height - h - 2;
        return (
          <rect
            key={`${p.checked_at}-${idx}`}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1}
            className={
              ok
                ? "fill-emerald-500/70"
                : "fill-rose-500/80"
            }
          >
            <title>
              {p.status} — {p.latency_ms ?? "?"} ms — {p.checked_at}
              {p.error ? ` — ${p.error}` : ""}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
