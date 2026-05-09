import "server-only";

import type { AdminPageBlockRow } from "@/app/admin/_types";

import {
  type ChartBlockConfig,
  type ChartResult,
  type KpiBlockConfig,
  type KpiResult,
  type MarkdownBlockConfig,
  type TableBlockConfig,
  type TableColumn,
  type TableResult,
  executeChartBlock,
  executeKpiBlock,
  executeMarkdownBlock,
  executeTableBlock,
  formatKpiValue,
  formatTableCell,
} from "./index";

/**
 * Server component that renders an admin_page_blocks row to HTML.
 *
 * Used by:
 *   - /admin/pages/[id]   — live preview pane
 *   - /admin/custom/[slug] — public viewer (admins-only because the
 *                            /admin/* layout already gates access)
 *
 * Markdown bodies are admin-authored and run through the same renderer
 * /admin/help uses, so dangerouslySetInnerHTML is acceptable.
 */
export async function BlockRenderer({ block }: { block: AdminPageBlockRow }) {
  const cfg = (block.config ?? {}) as Record<string, unknown>;

  switch (block.kind) {
    case "kpi": {
      const result = await executeKpiBlock(cfg as KpiBlockConfig);
      return <KpiBlock title={block.title} result={result} />;
    }
    case "table": {
      const result = await executeTableBlock(cfg as TableBlockConfig);
      return <TableBlock title={block.title} result={result} />;
    }
    case "chart": {
      const result = await executeChartBlock(cfg as ChartBlockConfig);
      return <ChartBlock title={block.title} result={result} />;
    }
    case "markdown": {
      const result = await executeMarkdownBlock(cfg as MarkdownBlockConfig);
      return <MarkdownBlock title={block.title} html={result.html} />;
    }
    case "button":
      return <ButtonBlock block={block} cfg={cfg} />;
    case "iframe":
      return <IframeBlock title={block.title} cfg={cfg} />;
    case "form":
      return <FormBlock block={block} cfg={cfg} />;
    case "divider":
      return <hr className="my-4 border-app" />;
    default:
      return (
        <BlockShell title={block.title}>
          <div className="text-xs text-rose-500">
            Unknown block kind: {String(block.kind)}
          </div>
        </BlockShell>
      );
  }
}

/* ─────────────────────── shells + sub-renderers ─────────────────────── */

function BlockShell({
  title,
  children,
}: {
  title: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-4">
      {title ? (
        <h2 className="mb-3 text-sm font-semibold text-app">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

function PlaceholderHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
      <div className="font-medium">Set up admin SQL exec</div>
      <div className="mt-1 opacity-90">{message}</div>
    </div>
  );
}

function ErrorHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-500">
      {message}
    </div>
  );
}

function KpiBlock({
  title,
  result,
}: {
  title: string | null;
  result: KpiResult;
}) {
  return (
    <BlockShell title={title}>
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {result.label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-app">
        {formatKpiValue(result.value, result.format, result.currency)}
      </div>
      {result.placeholder && result.error ? (
        <div className="mt-3">
          <PlaceholderHint message={result.error} />
        </div>
      ) : !result.ok && result.error ? (
        <div className="mt-3">
          <ErrorHint message={result.error} />
        </div>
      ) : null}
    </BlockShell>
  );
}

function TableBlock({
  title,
  result,
}: {
  title: string | null;
  result: TableResult;
}) {
  if (!result.ok) {
    return (
      <BlockShell title={title}>
        {result.placeholder && result.error ? (
          <PlaceholderHint message={result.error} />
        ) : (
          <ErrorHint message={result.error ?? "Query failed."} />
        )}
      </BlockShell>
    );
  }

  return (
    <BlockShell title={title}>
      <div className="overflow-x-auto rounded-lg border border-app bg-app">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              {result.columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-left font-normal"
                >
                  {c.label ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, result.columns.length)}
                  className="px-3 py-6 text-center text-xs text-faint"
                >
                  No rows.
                </td>
              </tr>
            ) : (
              result.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-app last:border-b-0 hover:bg-app-elevated/50"
                >
                  {result.columns.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-2 text-secondary"
                    >
                      {formatTableCell(row[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </BlockShell>
  );
}

function ChartBlock({
  title,
  result,
}: {
  title: string | null;
  result: ChartResult;
}) {
  if (!result.ok) {
    return (
      <BlockShell title={title}>
        {result.placeholder && result.error ? (
          <PlaceholderHint message={result.error} />
        ) : (
          <ErrorHint message={result.error ?? "Chart failed."} />
        )}
      </BlockShell>
    );
  }

  const series = result.series;
  const labels = result.x;
  const W = 600;
  const H = 220;
  const padL = 44;
  const padR = 12;
  const padT = 8;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const palette = [
    "#3b82f6", "#10b981", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4",
  ];

  if (series.length === 0 || labels.length === 0) {
    return (
      <BlockShell title={title}>
        <div className="rounded-lg border border-app bg-app p-6 text-center text-xs text-faint">
          No data.
        </div>
      </BlockShell>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const maxY = Math.max(1, ...allValues);
  const minY = Math.min(0, ...allValues);
  const yRange = Math.max(1, maxY - minY);

  const stepX =
    labels.length > 1 ? innerW / (labels.length - 1) : innerW;
  const projY = (v: number) =>
    padT + innerH - ((v - minY) / yRange) * innerH;

  return (
    <BlockShell title={title}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full text-faint"
        role="img"
        aria-label={title ?? "chart"}
      >
        {/* Y-axis ticks (4 lines). */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padT + (innerH * i) / 4;
          const v = maxY - (yRange * i) / 4;
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                className="fill-faint"
              >
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* X-axis tick labels (sparse — first, middle, last). */}
        {labels.length > 0 ? (
          <>
            <text
              x={padL}
              y={H - 6}
              fontSize={10}
              textAnchor="start"
              className="fill-faint"
            >
              {labels[0]}
            </text>
            {labels.length > 2 ? (
              <text
                x={padL + innerW / 2}
                y={H - 6}
                fontSize={10}
                textAnchor="middle"
                className="fill-faint"
              >
                {labels[Math.floor(labels.length / 2)]}
              </text>
            ) : null}
            {labels.length > 1 ? (
              <text
                x={W - padR}
                y={H - 6}
                fontSize={10}
                textAnchor="end"
                className="fill-faint"
              >
                {labels[labels.length - 1]}
              </text>
            ) : null}
          </>
        ) : null}

        {/* Series. */}
        {result.chart_type === "bar"
          ? series.map((s, sIdx) => {
              const color = palette[sIdx % palette.length];
              const groupCount = series.length;
              // Bars are grouped per X.
              const groupWidth =
                labels.length > 0 ? innerW / labels.length : innerW;
              const barWidth = Math.max(2, (groupWidth - 4) / groupCount);
              return (
                <g key={s.label}>
                  {s.values.map((v, i) => {
                    const x =
                      padL +
                      i * groupWidth +
                      (groupWidth - barWidth * groupCount) / 2 +
                      sIdx * barWidth;
                    const y = projY(v);
                    const h = projY(Math.min(0, minY)) - y;
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={Math.min(y, projY(0))}
                        width={barWidth}
                        height={Math.max(1, Math.abs(h))}
                        fill={color}
                        opacity={0.85}
                      />
                    );
                  })}
                </g>
              );
            })
          : series.map((s, sIdx) => {
              const color = palette[sIdx % palette.length];
              const points = s.values
                .map((v, i) => `${padL + i * stepX},${projY(v)}`)
                .join(" ");
              return (
                <g key={s.label}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={padL + i * stepX}
                      cy={projY(v)}
                      r={2}
                      fill={color}
                    />
                  ))}
                </g>
              );
            })}
      </svg>

      {/* Legend. */}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {series.map((s, i) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 text-secondary"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: palette[i % palette.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </BlockShell>
  );
}

function MarkdownBlock({
  title,
  html,
}: {
  title: string | null;
  html: string;
}) {
  return (
    <BlockShell title={title}>
      <div
        className="text-sm text-app"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </BlockShell>
  );
}

type ButtonConfig = {
  label?: string;
  action_kind?: "rpc" | "workflow" | "href";
  target?: string;
  confirm?: string;
};

function ButtonBlock({
  block,
  cfg,
}: {
  block: AdminPageBlockRow;
  cfg: Record<string, unknown>;
}) {
  const c = cfg as ButtonConfig;
  const label = String(c.label ?? "Run");
  const kind = c.action_kind === "workflow" || c.action_kind === "href"
    ? c.action_kind
    : "rpc";
  const target = String(c.target ?? "").trim();

  if (!target) {
    return (
      <BlockShell title={block.title}>
        <ErrorHint message="Button block has no target configured." />
      </BlockShell>
    );
  }

  if (kind === "href") {
    // Direct link, no POST. Open in a new tab.
    return (
      <BlockShell title={block.title}>
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          {label} ↗
        </a>
      </BlockShell>
    );
  }

  // RPC / workflow → POST to the API route.
  // We can't run a JS confirm() from a server component; we surface the
  // configured confirm string as a sub-label so admins read it before
  // clicking.
  const confirmMsg = String(c.confirm ?? "").trim();
  return (
    <BlockShell title={block.title}>
      <form
        method="post"
        action={`/api/admin/pages/${encodeURIComponent(block.page_id)}/run-action`}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="block_id" value={block.id} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          {label}
        </button>
        <span className="text-[11px] text-muted">
          {kind === "rpc" ? `RPC: ${target}` : `Workflow: ${target}`}
        </span>
        {confirmMsg ? (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ {confirmMsg}
          </span>
        ) : null}
      </form>
    </BlockShell>
  );
}

type IframeConfig = {
  url?: string;
  height?: number;
};

function IframeBlock({
  title,
  cfg,
}: {
  title: string | null;
  cfg: Record<string, unknown>;
}) {
  const c = cfg as IframeConfig;
  const url = String(c.url ?? "").trim();
  const height = Number(c.height ?? 480);
  const safeHeight = Number.isFinite(height) ? Math.max(120, Math.min(1200, height)) : 480;

  if (!url) {
    return (
      <BlockShell title={title}>
        <ErrorHint message="Iframe block has no URL configured." />
      </BlockShell>
    );
  }

  return (
    <BlockShell title={title}>
      <iframe
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ height: `${safeHeight}px` }}
        className="block w-full rounded-lg border border-app bg-app"
        title={title ?? "embedded content"}
      />
    </BlockShell>
  );
}

type FormField = {
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
};

type FormConfig = {
  fields?: FormField[];
  submit_label?: string;
  submit_target?: string;
};

function FormBlock({
  block,
  cfg,
}: {
  block: AdminPageBlockRow;
  cfg: Record<string, unknown>;
}) {
  const c = cfg as FormConfig;
  const fields = Array.isArray(c.fields) ? c.fields : [];
  const submitLabel = String(c.submit_label ?? "Submit");
  const submitTarget = String(c.submit_target ?? "").trim();

  if (!submitTarget) {
    return (
      <BlockShell title={block.title}>
        <ErrorHint message="Form block has no submit_target configured." />
      </BlockShell>
    );
  }

  return (
    <BlockShell title={block.title}>
      <form
        method="post"
        action={`/api/admin/pages/${encodeURIComponent(block.page_id)}/run-action`}
        className="space-y-3"
      >
        <input type="hidden" name="block_id" value={block.id} />
        {fields.map((f, i) => {
          const name = String(f.name ?? "").trim();
          if (!name) return null;
          const t = String(f.type ?? "text").toLowerCase();
          const inputClass =
            "w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";
          return (
            <label key={`${name}-${i}`} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                {f.label ?? name}
              </span>
              {t === "textarea" ? (
                <textarea
                  name={name}
                  required={!!f.required}
                  rows={4}
                  placeholder={f.placeholder ?? ""}
                  className={`${inputClass} resize-y`}
                />
              ) : t === "select" || t === "boolean" ? (
                <select name={name} className={inputClass} defaultValue="">
                  <option value="">—</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  name={name}
                  type={
                    t === "number" || t === "email" || t === "url" || t === "date"
                      ? t
                      : "text"
                  }
                  required={!!f.required}
                  placeholder={f.placeholder ?? ""}
                  className={inputClass}
                />
              )}
            </label>
          );
        })}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            {submitLabel}
          </button>
        </div>
        <div className="text-[11px] text-muted">
          Posts to <span className="font-mono">{submitTarget}</span>
        </div>
      </form>
    </BlockShell>
  );
}

/* Re-export TableColumn so editor pages can build column lists without
 * a second import. */
export type { TableColumn };
