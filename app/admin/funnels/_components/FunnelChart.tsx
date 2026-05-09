/**
 * Pure inline-SVG horizontal funnel chart. No chart libs, no client JS.
 * Each step is a horizontal bar whose width is proportional to that
 * step's user count vs the first step. Drop-off percentages show
 * step-to-step conversion loss.
 */

import type { FunnelStep } from "../_helpers";

export interface FunnelChartStep extends FunnelStep {
  count: number;
}

export default function FunnelChart({
  steps,
  rangeLabel,
}: {
  steps: FunnelChartStep[];
  rangeLabel: string;
}) {
  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app p-6 text-center text-xs text-faint">
        No steps defined.
      </div>
    );
  }

  // Geometry — wide rectangle per step; full-width SVG.
  const W = 720;
  const padX = 12;
  const rowH = 56;
  const gap = 8;
  const labelW = 200;
  const innerW = W - padX * 2 - labelW - 12;
  const H = padX * 2 + steps.length * rowH + (steps.length - 1) * gap;

  const top = steps[0]?.count ?? 0;
  const maxFloor = Math.max(top, 1); // avoid divide-by-zero

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Funnel conversion chart"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="transparent"
      />
      {/* Legend */}
      <text
        x={W - padX}
        y={padX + 4}
        textAnchor="end"
        fontSize={9}
        className="fill-faint"
      >
        {rangeLabel}
      </text>

      {steps.map((step, i) => {
        const ratio = step.count / maxFloor;
        const w = Math.max(2, ratio * innerW);
        const y = padX + 8 + i * (rowH + gap);
        const x = padX + labelW;

        const prev = i > 0 ? steps[i - 1].count : null;
        const dropOff =
          prev !== null && prev > 0
            ? ((prev - step.count) / prev) * 100
            : null;
        const conversion =
          prev !== null && prev > 0 ? (step.count / prev) * 100 : null;

        return (
          <g key={`${i}-${step.event_kind}-${step.name}`}>
            {/* Step label */}
            <text
              x={padX + labelW - 8}
              y={y + 16}
              textAnchor="end"
              fontSize={11}
              className="fill-app"
              fontWeight={600}
            >
              <tspan>{i + 1}.</tspan>
              <tspan dx={6}>{truncate(step.name, 22)}</tspan>
            </text>
            <text
              x={padX + labelW - 8}
              y={y + 32}
              textAnchor="end"
              fontSize={9}
              className="fill-faint"
              fontFamily="ui-monospace, monospace"
            >
              {truncate(step.event_kind, 26)}
            </text>

            {/* Bar background */}
            <rect
              x={x}
              y={y + 6}
              width={innerW}
              height={rowH - 12}
              rx={6}
              ry={6}
              className="fill-app"
              opacity={0.35}
            />
            {/* Bar fill */}
            <rect
              x={x}
              y={y + 6}
              width={w}
              height={rowH - 12}
              rx={6}
              ry={6}
              className="fill-tool-accent"
              opacity={0.85}
            />
            {/* Count label inside bar */}
            <text
              x={x + 12}
              y={y + 16}
              fontSize={11}
              fontWeight={700}
              className="fill-white"
              fontFamily="ui-monospace, monospace"
            >
              {step.count.toLocaleString()}
            </text>
            <text
              x={x + 12}
              y={y + 32}
              fontSize={9}
              className="fill-white"
              fontFamily="ui-monospace, monospace"
              opacity={0.8}
            >
              users
            </text>

            {/* Conversion / drop-off chips on the right */}
            {conversion !== null && (
              <>
                <text
                  x={x + innerW - 10}
                  y={y + 16}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  className={
                    conversion >= 50
                      ? "fill-emerald-500"
                      : conversion >= 25
                        ? "fill-amber-500"
                        : "fill-rose-500"
                  }
                  fontFamily="ui-monospace, monospace"
                >
                  {conversion.toFixed(1)}% kept
                </text>
                <text
                  x={x + innerW - 10}
                  y={y + 32}
                  textAnchor="end"
                  fontSize={9}
                  className="fill-rose-500"
                  fontFamily="ui-monospace, monospace"
                  opacity={0.85}
                >
                  −{dropOff!.toFixed(1)}%
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* End-to-end overall conversion footer */}
      {steps.length > 1 && (
        <text
          x={padX + labelW + innerW}
          y={H - padX}
          textAnchor="end"
          fontSize={10}
          className="fill-app"
          fontFamily="ui-monospace, monospace"
        >
          overall:{" "}
          {top > 0
            ? ((steps[steps.length - 1].count / top) * 100).toFixed(1)
            : "0.0"}
          %
        </text>
      )}
    </svg>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}
