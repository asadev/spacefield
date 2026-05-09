/**
 * Inline SVG chart primitives for /admin/insights. Server-rendered, no
 * external chart libraries — the bundle stays small and the markup is
 * always present in the initial HTML.
 *
 * The shape is the same approach the Share analytics page uses: a
 * fixed viewBox plus `preserveAspectRatio="none"` so the charts fill
 * their parent's width and the parent's CSS controls the visual size.
 */

const COLOR_GRID = "currentColor";

/** A palette that's stable per call_kind so colors don't shuffle when
 * a series enters or leaves the dataset. The keys mirror CALL_KINDS in
 * `_types.ts` — anything else falls through to a neutral grey. */
const SERIES_COLORS: Record<string, string> = {
  classifier: "#3b82f6", // blue-500
  executor: "#10b981", // emerald-500
  orchestrator: "#a855f7", // purple-500
  formatter: "#f59e0b", // amber-500
};

function colorFor(key: string, fallbackIndex: number): string {
  if (SERIES_COLORS[key]) return SERIES_COLORS[key];
  // Cycle through a palette for unknown call_kinds the runtime might
  // emit in the future. Stable per index so re-renders are calm.
  const palette = [
    "#3b82f6",
    "#10b981",
    "#a855f7",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#84cc16",
  ];
  return palette[fallbackIndex % palette.length];
}

export type DailyDatum = {
  day: string; // ISO date YYYY-MM-DD
  values: Record<string, number>;
};

/**
 * Multi-series line chart. Each series in `seriesKeys` becomes one line.
 * Y-axis is auto-scaled to the max value across all series; if every
 * value is zero we render an empty-state.
 */
export function MultiLineChart({
  data,
  seriesKeys,
  height = 220,
  yLabel,
  valueFormatter,
  ariaLabel,
}: {
  data: DailyDatum[];
  seriesKeys: string[];
  height?: number;
  yLabel?: string;
  valueFormatter?: (value: number) => string;
  ariaLabel?: string;
}) {
  const W = 600;
  const H = height;
  const padL = 44;
  const padR = 12;
  const padT = 8;
  const padB = 24;

  if (data.length === 0 || seriesKeys.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fontSize={11}
          className="fill-faint"
        >
          no data
        </text>
      </svg>
    );
  }

  const maxY = Math.max(
    1,
    ...data.flatMap((d) => seriesKeys.map((k) => d.values[k] ?? 0))
  );
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const project = (i: number, v: number) => {
    const x = padL + (data.length === 1 ? innerW / 2 : i * stepX);
    const y = padT + innerH - (v / maxY) * innerH;
    return [x, y] as const;
  };

  const seriesPath = (key: string) =>
    data
      .map((d, i) => {
        const [x, y] = project(i, d.values[key] ?? 0);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const fmt = valueFormatter ?? ((v: number) => Math.round(v).toLocaleString());
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Y-axis grid + labels */}
      {ticks.map((tv, i) => {
        const y = padT + innerH - (tv / maxY) * innerH;
        return (
          <g key={i} className="text-faint">
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke={COLOR_GRID}
              strokeOpacity={0.1}
              strokeDasharray="2 3"
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              className="fill-faint"
            >
              {fmt(tv)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => {
        if (i % xLabelEvery !== 0 && i !== data.length - 1) return null;
        const [x] = project(i, 0);
        return (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            className="fill-faint"
          >
            {d.day.slice(5)}
          </text>
        );
      })}

      {yLabel ? (
        <text
          x={6}
          y={padT + innerH / 2}
          fontSize={9}
          textAnchor="middle"
          transform={`rotate(-90, 10, ${padT + innerH / 2})`}
          className="fill-faint"
        >
          {yLabel}
        </text>
      ) : null}

      {/* Series */}
      {seriesKeys.map((k, i) => (
        <path
          key={k}
          d={seriesPath(k)}
          fill="none"
          stroke={colorFor(k, i)}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Legend chips matching the `MultiLineChart` colors. */
export function ChartLegend({ seriesKeys }: { seriesKeys: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary">
      {seriesKeys.map((k, i) => (
        <span
          key={k}
          className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-2 py-0.5"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colorFor(k, i) }}
          />
          <span className="font-mono tabular-nums">{k}</span>
        </span>
      ))}
    </div>
  );
}

/** Single-series line — used for DAU/WAU/MAU. */
export function SingleLineChart({
  values,
  labels,
  height = 140,
  stroke = "#3b82f6",
  ariaLabel,
}: {
  values: number[];
  labels: string[];
  height?: number;
  stroke?: string;
  ariaLabel?: string;
}) {
  const W = 400;
  const H = height;
  const padL = 36;
  const padR = 8;
  const padT = 8;
  const padB = 22;

  if (values.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fontSize={11}
          className="fill-faint"
        >
          no data
        </text>
      </svg>
    );
  }

  const maxY = Math.max(1, ...values);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : innerW;

  const project = (i: number, v: number) => {
    const x = padL + (values.length === 1 ? innerW / 2 : i * stepX);
    const y = padT + innerH - (v / maxY) * innerH;
    return [x, y] as const;
  };

  const path = values
    .map((v, i) => {
      const [x, y] = project(i, v);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const ticks = [0, 0.5, 1].map((t) => Math.round(t * maxY));
  const xLabelEvery = Math.max(1, Math.ceil(values.length / 4));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {ticks.map((tv, i) => {
        const y = padT + innerH - (tv / maxY) * innerH;
        return (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke={COLOR_GRID}
              strokeOpacity={0.1}
              strokeDasharray="2 3"
            />
            <text
              x={padL - 4}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              className="fill-faint"
            >
              {tv.toLocaleString()}
            </text>
          </g>
        );
      })}
      {labels.map((label, i) => {
        if (i % xLabelEvery !== 0 && i !== labels.length - 1) return null;
        const [x] = project(i, 0);
        return (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            className="fill-faint"
          >
            {label}
          </text>
        );
      })}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
