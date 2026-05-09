/**
 * Inline SVG chart primitives for admin/analytics. No external chart
 * libraries — everything is plain SVG so the bundle stays small and the
 * rendering is server-only.
 */

const COLOR_VIEWS = "#3b82f6"; // blue-500 — matches admin info chip tone
const COLOR_SUBMITS = "#10b981"; // emerald-500
const COLOR_CONVERTS = "#a855f7"; // purple-500
const COLOR_GRID = "currentColor";

export type SeriesPoint = {
  day: string; // ISO date (YYYY-MM-DD)
  views: number;
  submits: number;
  converts: number;
};

/** Render a multi-series line chart as inline SVG. Width 100% of parent. */
export function LineChart({
  data,
  height = 180,
  ariaLabel,
}: {
  data: SeriesPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  // viewBox in arbitrary units: 600 wide, fixed height. Chart fills 100%.
  const W = 600;
  const H = height;
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 22;

  if (data.length === 0) {
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
          className="fill-faint"
          fontSize={11}
        >
          no data
        </text>
      </svg>
    );
  }

  const maxY =
    Math.max(
      1,
      ...data.flatMap((p) => [p.views, p.submits, p.converts])
    ) || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX =
    data.length > 1 ? innerW / (data.length - 1) : innerW;

  const project = (i: number, v: number) => {
    const x = padL + (data.length === 1 ? innerW / 2 : i * stepX);
    const y = padT + innerH - (v / maxY) * innerH;
    return [x, y] as const;
  };

  const seriesLine = (key: "views" | "submits" | "converts") =>
    data
      .map((p, i) => {
        const [x, y] = project(i, p[key]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  // Y-axis tick values (4 lines including 0 and max).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxY));
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 6));

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
              x={padL - 4}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              className="fill-faint"
            >
              {tv}
            </text>
          </g>
        );
      })}

      {/* X-axis labels (date short form) */}
      {data.map((p, i) => {
        if (i % xLabelEvery !== 0 && i !== data.length - 1) return null;
        const [x] = project(i, 0);
        const short = p.day.slice(5); // MM-DD
        return (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            className="fill-faint"
          >
            {short}
          </text>
        );
      })}

      {/* Series */}
      <path
        d={seriesLine("views")}
        fill="none"
        stroke={COLOR_VIEWS}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={seriesLine("submits")}
        fill="none"
        stroke={COLOR_SUBMITS}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={seriesLine("converts")}
        fill="none"
        stroke={COLOR_CONVERTS}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Tiny numeric sparkline. */
export function Sparkline({
  values,
  height = 40,
  stroke = COLOR_VIEWS,
  ariaLabel,
}: {
  values: number[];
  height?: number;
  stroke?: string;
  ariaLabel?: string;
}) {
  const W = 200;
  const H = height;
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
          fontSize={10}
          className="fill-faint"
        >
          —
        </text>
      </svg>
    );
  }

  const maxY = Math.max(1, ...values);
  const minY = Math.min(0, ...values);
  const range = maxY - minY || 1;
  const stepX = values.length > 1 ? W / (values.length - 1) : W;

  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = H - 2 - ((v - minY) / range) * (H - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Funnel: views → submits → converts as a horizontal bar set. */
export function Funnel({
  views,
  submits,
  converts,
  height = 120,
}: {
  views: number;
  submits: number;
  converts: number;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padX = 8;
  const innerW = W - padX * 2;
  const max = Math.max(views, submits, converts, 1);
  const stages = [
    { label: "Views", v: views, color: COLOR_VIEWS },
    { label: "Submits", v: submits, color: COLOR_SUBMITS },
    { label: "Converts", v: converts, color: COLOR_CONVERTS },
  ];
  const rowH = (H - 12) / stages.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Funnel: views to submits to converts"
    >
      {stages.map((s, i) => {
        const w = (s.v / max) * innerW;
        const y = i * rowH + 4;
        return (
          <g key={s.label}>
            <rect
              x={padX}
              y={y + 2}
              width={Math.max(2, w)}
              height={rowH - 8}
              rx={3}
              fill={s.color}
              fillOpacity={0.15}
              stroke={s.color}
              strokeWidth={1}
            />
            <text
              x={padX + 6}
              y={y + rowH / 2 + 1}
              fontSize={11}
              fontWeight={600}
              className="fill-app"
            >
              {s.label}
            </text>
            <text
              x={W - padX - 6}
              y={y + rowH / 2 + 1}
              textAnchor="end"
              fontSize={11}
              className="fill-secondary"
            >
              {s.v.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const ANALYTICS_COLORS = {
  views: COLOR_VIEWS,
  submits: COLOR_SUBMITS,
  converts: COLOR_CONVERTS,
};
